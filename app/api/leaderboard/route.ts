import {currentUser,database,getLink,json,sameOrigin} from '../../../lib/server';
import {prepareLadder} from '../../../lib/ladder-store';
import postcodeData from '../../../public/postcodes.json';
export const dynamic='force-dynamic';
const postcodes=postcodeData as Record<string,string[][]>;
const place=(code:string,locality?:string)=>postcodes[code]?.find(p=>p[0]===locality)||postcodes[code]?.[0];
type Member = {user_id:string;alias:string;postcode:string;locality:string;leaderboard_data:string|null};
type Summary = {name:string|null;points:number;basePoints:number;performancePoints:number;eligibleMatches:number;wins:number;form:string;fetchedAt:number;provisional:boolean};

export async function GET(request?:Request) {
  const user=await currentUser();
  const db=database();await prepareLadder(db);
  const params=request?new URL(request.url).searchParams:new URLSearchParams();
  const scope=params.get('scope')||'country',postcode=params.get('postcode')||'6000';
  const location=place(postcode,params.get('locality')||undefined);
  if(!['postcode','city','state','country'].includes(scope)||scope!=='country'&&!location)return json({error:'Invalid ladder location'},400);
  const offset=Math.min(100000,Math.max(0,Number(params.get('offset'))||0));
  if(!Number.isInteger(offset))return json({error:'Invalid page'},400);
  let where='s.leaderboard_data IS NOT NULL AND json_extract(s.leaderboard_data,\'$.eligibleMatches\')>0';
  const values:unknown[]=[];
  if(scope!=='country'){
    const codes=scope==='postcode'?[postcode]:Object.keys(postcodes).filter(code=>postcodes[code].some(p=>scope==='state'?p[1]===location![1]:(p[3]||p[0])===(location![3]||location![0])));
    // Scope filters use trusted reference-data codes; no user text is interpolated.
    where+=` AND m.postcode IN (${codes.map(code=>`'${code}'`).join(',')})`;
    if(scope==='city'){
      const names=[...new Set(codes.flatMap(code=>postcodes[code].filter(p=>(p[3]||p[0])===(location![3]||location![0])).map(p=>p[0])))];
      where+=` AND p.locality IN (${names.map(()=>'?').join(',')})`;values.push(...names);
    }
  }
  const join='FROM ladder_members m JOIN steam_links s ON s.user_id=m.user_id AND s.steam_id=m.steam_id LEFT JOIN ladder_places p ON p.user_id=m.user_id';
  const records=await db.prepare(`SELECT m.user_id,m.alias,m.postcode,p.locality,s.leaderboard_data ${join} WHERE ${where} ORDER BY json_extract(s.leaderboard_data,'$.points') DESC,1.0*json_extract(s.leaderboard_data,'$.wins')/json_extract(s.leaderboard_data,'$.eligibleMatches') DESC,m.alias,m.user_id LIMIT 101 OFFSET ?`).bind(...values,offset).all<Member>();
  const players=records.results.slice(0,100).flatMap(row=>{
    const location=place(row.postcode,row.locality);if(!location)return [];
    let data:Summary;try{data=JSON.parse(row.leaderboard_data!)}catch{return []}
    return [{name:data.name||row.alias,postcode:row.postcode,location,points:data.points,basePoints:data.basePoints,performancePoints:data.performancePoints,win:Math.round(data.wins/data.eligibleMatches*100),matches:data.eligibleMatches,form:data.form,fetchedAt:data.fetchedAt,provisional:data.provisional,isYou:row.user_id===user?.userId}];
  });
  const member=user?await db.prepare('SELECT m.alias,m.postcode,p.locality FROM ladder_members m LEFT JOIN ladder_places p ON p.user_id=m.user_id WHERE m.user_id=?').bind(user.userId).first<Member>():null;
  const ownLink=user?await getLink(user.userId):null;
  let gamerName=null;try{gamerName=JSON.parse(ownLink?.dota_data||'null')?.name||null}catch{}
  return json({players,membership:member?{alias:member.alias,postcode:member.postcode,locality:member.locality}:null,gamerName,updatedAt:Date.now(),nextOffset:records.results.length>100?offset+100:null});
}
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  const link=await getLink(user.userId);if(!link)return json({error:'Connect Steam before joining a ladder.'},409);
  if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Request too large'},413);
  let body;try{const text=await request.text();if(text.length>2048)return json({error:'Request too large'},413);body=JSON.parse(text)}catch{return json({error:'Invalid profile'},400)}
  const postcode=typeof body?.postcode==='string'?body.postcode.trim():'';
  const location=place(postcode,body?.locality);
  if(!/^\d{4}$/.test(postcode)||!location||(body?.locality&&!postcodes[postcode].some(p=>p[0]===body.locality)))return json({error:'Enter a valid Australian postcode and choose its suburb/town.'},400);
  let alias='';try{alias=JSON.parse(link.dota_data||'null')?.name?.trim()||''}catch{}
  if(!alias)return json({error:'Refresh game data first so we can use your verified gamer name.'},409);
  alias=alias.slice(0,80);
  const db=database();await prepareLadder(db);
  await db.batch([
    db.prepare('INSERT INTO ladder_members (user_id,steam_id,alias,postcode,joined_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET steam_id=excluded.steam_id,alias=excluded.alias,postcode=excluded.postcode').bind(user.userId,link.steam_id,alias,postcode,Date.now()),
    db.prepare('INSERT INTO ladder_places (user_id,locality) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET locality=excluded.locality').bind(user.userId,location[0]),
  ]);
  return json({saved:true});
}
export async function DELETE(request:Request) {
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  const db=database();await prepareLadder(db);
  await db.batch([db.prepare('DELETE FROM ladder_members WHERE user_id=?').bind(user.userId),db.prepare('DELETE FROM ladder_places WHERE user_id=?').bind(user.userId)]);
  return json({saved:true});
}
