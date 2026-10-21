import {currentUser,database,getLink,json,sameOrigin} from '../../../lib/server';
import {matchPerformance} from '../../../lib/match-performance.mjs';
export const dynamic='force-dynamic';
const locations:Record<string,string[]>={'6000':['Perth','WA'],'6160':['Fremantle','WA'],'2000':['Sydney','NSW'],'3000':['Melbourne','VIC']};
async function prepare(){await database().prepare('CREATE TABLE IF NOT EXISTS ladder_members (user_id TEXT PRIMARY KEY, steam_id TEXT NOT NULL UNIQUE, alias TEXT NOT NULL, postcode TEXT NOT NULL, joined_at INTEGER NOT NULL)').run()}
export async function GET(){
 const user=await currentUser();if(!user)return json({error:'Sign in to view the local ladder.'},401);
 await prepare();
 const records=await database().prepare('SELECT m.*,s.dota_data FROM ladder_members m JOIN steam_links s ON s.user_id=m.user_id AND s.steam_id=m.steam_id').all();
 const players=[];let membership=null;
 for(const row of records.results as any[]){if(!locations[row.postcode])continue;if(row.user_id===user.userId)membership={alias:row.alias,postcode:row.postcode};
 let data;try{data=JSON.parse(row.dota_data||'null')}catch{continue}
 if(!Array.isArray(data?.matches))continue;
 const matches=data.matches.slice(0,50);const performance=matchPerformance(matches);if(!performance.eligibleMatches)continue;
 players.push({name:row.alias,postcode:row.postcode,points:performance.points,win:Math.round(performance.wins/performance.eligibleMatches*100),matches:performance.eligibleMatches,form:matches.slice(0,5).map((m:any)=>m.abandoned?'A':m.won?'W':'L').join(''),fetchedAt:data.fetchedAt||null,unverified:data.syncMethod==='browser',provisional:performance.provisional,isYou:row.user_id===user.userId});
 }
 return json({players,membership,updatedAt:Date.now()});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
 const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
 const link=await getLink(user.userId);if(!link)return json({error:'Connect Steam before joining a ladder.'},409);
 if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Request too large'},413);
 let body;try{const text=await request.text();if(text.length>2048)return json({error:'Request too large'},413);body=JSON.parse(text)}catch{return json({error:'Invalid profile'},400)}
 const alias=typeof body?.alias==='string'?body.alias.trim():'';if(alias.length<1||alias.length>32||!locations[body?.postcode])return json({error:'Choose a supported postcode and a name of 1–32 characters.'},400);
 await prepare();await database().prepare('INSERT INTO ladder_members (user_id,steam_id,alias,postcode,joined_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET steam_id=excluded.steam_id,alias=excluded.alias,postcode=excluded.postcode').bind(user.userId,link.steam_id,alias,body.postcode,Date.now()).run();
 return json({saved:true});
}
export async function DELETE(request:Request){if(!sameOrigin(request))return json({error:'Invalid request origin'},403);const user=await currentUser();if(!user)return json({error:'Sign in required'},401);await prepare();await database().prepare('DELETE FROM ladder_members WHERE user_id=?').bind(user.userId).run();return json({saved:true})}
