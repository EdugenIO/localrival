import {currentUser,database,getLink,json,sameOrigin} from '../../../lib/server';
import {matchPerformance} from '../../../lib/match-performance.mjs';
export const dynamic='force-dynamic';
import postcodeData from '../../../public/postcodes.json';
const postcodes=postcodeData as Record<string,string[][]>;
const place=(code:string,locality?:string)=>postcodes[code]?.find(p=>p[0]===locality)||postcodes[code]?.[0];
async function prepare(){await database().prepare('CREATE TABLE IF NOT EXISTS ladder_members (user_id TEXT PRIMARY KEY, steam_id TEXT NOT NULL UNIQUE, alias TEXT NOT NULL, postcode TEXT NOT NULL, joined_at INTEGER NOT NULL)').run();await database().prepare('CREATE TABLE IF NOT EXISTS ladder_places (user_id TEXT PRIMARY KEY, locality TEXT NOT NULL)').run()}
export async function GET(){
 const user=await currentUser();if(!user)return json({error:'Sign in to view the local ladder.'},401);
 await prepare();
 const records=await database().prepare('SELECT m.*,s.dota_data,p.locality FROM ladder_members m JOIN steam_links s ON s.user_id=m.user_id AND s.steam_id=m.steam_id LEFT JOIN ladder_places p ON p.user_id=m.user_id').all();
 const players=[];let membership=null;
 for(const row of records.results as any[]){const location=place(row.postcode,row.locality);if(!location)continue;
 let data;try{data=JSON.parse(row.dota_data||'null')}catch{continue}
 const name=typeof data?.name==='string'&&data.name.trim()?data.name.trim().slice(0,80):row.alias;
 if(row.user_id===user.userId)membership={alias:name,postcode:row.postcode,locality:location[0]};
 if(!Array.isArray(data?.matches))continue;
 const matches=data.matches.slice(0,50);const performance=matchPerformance(matches);if(!performance.eligibleMatches)continue;
 players.push({name,postcode:row.postcode,location,points:performance.points,win:Math.round(performance.wins/performance.eligibleMatches*100),matches:performance.eligibleMatches,form:matches.slice(0,5).map((m:any)=>m.abandoned?'A':m.won?'W':'L').join(''),fetchedAt:data.fetchedAt||null,provisional:performance.provisional,isYou:row.user_id===user.userId});
 }
 const ownLink=await getLink(user.userId);let gamerName=null;try{gamerName=JSON.parse(ownLink?.dota_data||'null')?.name||null}catch{}
 return json({players,membership,gamerName,updatedAt:Date.now()});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
 const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
 const link=await getLink(user.userId);if(!link)return json({error:'Connect Steam before joining a ladder.'},409);
 if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Request too large'},413);
 let body;try{const text=await request.text();if(text.length>2048)return json({error:'Request too large'},413);body=JSON.parse(text)}catch{return json({error:'Invalid profile'},400)}
 const postcode=typeof body?.postcode==='string'?body.postcode.trim():'';const location=place(postcode,body?.locality);if(!/^\d{4}$/.test(postcode)||!location||(body?.locality&&!postcodes[postcode].some(p=>p[0]===body.locality)))return json({error:'Enter a valid Australian postcode and choose its suburb/town.'},400);
 let alias='';try{alias=JSON.parse(link.dota_data||'null')?.name?.trim()||''}catch{}if(!alias)return json({error:'Sync your OpenDota profile first so we can use your gamer name.'},409);alias=alias.slice(0,80);
 await prepare();await database().prepare('INSERT INTO ladder_members (user_id,steam_id,alias,postcode,joined_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET steam_id=excluded.steam_id,alias=excluded.alias,postcode=excluded.postcode').bind(user.userId,link.steam_id,alias,postcode,Date.now()).run();
 await database().prepare('INSERT INTO ladder_places (user_id,locality) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET locality=excluded.locality').bind(user.userId,location[0]).run();
 return json({saved:true});
}
export async function DELETE(request:Request){if(!sameOrigin(request))return json({error:'Invalid request origin'},403);const user=await currentUser();if(!user)return json({error:'Sign in required'},401);await prepare();await database().prepare('DELETE FROM ladder_members WHERE user_id=?').bind(user.userId).run();return json({saved:true})}
