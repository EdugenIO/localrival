import {env} from 'cloudflare:workers';
import {database,json} from '../../../../lib/server';
import {hashState,steamAccountId} from '../../../../lib/steam-openid.mjs';
import {normalizeDota} from '../../../../lib/game-data.mjs';
export const dynamic='force-dynamic';
async function authorized(request:Request){const secret=(env as any).NIGHTLY_SYNC_TOKEN;if(!secret)return false;const incoming=request.headers.get('authorization')||'';return await hashState(incoming)===await hashState('Bearer '+secret)}
export async function GET(request:Request){if(!await authorized(request))return json({error:'Unauthorized'},401);const cursor=new URL(request.url).searchParams.get('after')||'';const cutoff=new URL(request.url).searchParams.get('force')==='1'?Date.now():Date.now()-6*60*60*1000;const result=await database().prepare("SELECT steam_id,COALESCE(json_extract(dota_data,'$.fetchedAt'),0) AS fetched_at FROM steam_links WHERE steam_id>? AND COALESCE(json_extract(dota_data,'$.fetchedAt'),0)<? AND refresh_after<=? ORDER BY steam_id LIMIT 100").bind(cursor,cutoff,Date.now()).all();return json({accounts:result.results.map((r:any)=>({steamId:r.steam_id,accountId:steamAccountId(r.steam_id),expectedFetchedAt:r.fetched_at})),nextCursor:result.results.length===100?(result.results[99] as any).steam_id:null})}
export async function POST(request:Request){
 if(!await authorized(request))return json({error:'Unauthorized'},401);
 if(!request.body)return json({error:'Missing data'},400);let raw='';let size=0;const reader=request.body.getReader();const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>200000){await reader.cancel();return json({error:'Too large'},413)}raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode();
 let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid data'},400)}
 if(!body||!/^7656119[0-9]{10}$/.test(body.steamId)||!Number.isFinite(body.expectedFetchedAt)||!Array.isArray(body.matches)||body.matches.length>50)return json({error:'Invalid account or matches'},400);
 const accountId=steamAccountId(body.steamId);if(String(body.accountId)!==accountId||(body.profile?.profile?.account_id!==undefined&&String(body.profile.profile.account_id)!==accountId))return json({error:'Profile mismatch'},400);
 let data;try{data=normalizeDota(body.profile,body.matches,body.totals)}catch{return json({error:'Invalid matches'},400)}
 // An empty provider response must not erase a populated match history.
 if(!data.matches.length)return json({skipped:true,reason:'No matches returned'});
 const now=Date.now();const snapshot={...data,fetchedAt:now,syncMethod:'nightly',syncIssue:null};
 const saved=await database().prepare("UPDATE steam_links SET dota_data=?,synced_at=?,refresh_after=? WHERE steam_id=? AND COALESCE(json_extract(dota_data,'$.fetchedAt'),0)=? RETURNING steam_id").bind(JSON.stringify(snapshot),now,now+60000,body.steamId,body.expectedFetchedAt).first();
 return json({saved:!!saved,skipped:!saved});
}
