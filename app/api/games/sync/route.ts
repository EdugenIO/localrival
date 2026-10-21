import { env } from 'cloudflare:workers';
import { currentUser, database, getLink, json, publicLink, sameOrigin } from '../../../../lib/server';
import { fetchDota, providerIssue } from '../../../../lib/game-data.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  const link=await getLink(user.userId);if(!link)return json({error:'Connect Steam first.'},409);
  const now=Date.now();
  const gate=await database().prepare('UPDATE steam_links SET refresh_after=? WHERE user_id=? AND steam_id=? AND refresh_after<=? RETURNING steam_id').bind(now+60000,user.userId,link.steam_id,now).first();
  if(!gate)return json({error:'Please wait one minute between refreshes.',account:publicLink(link)},429);
  const secrets=env as Cloudflare.Env & {STEAM_WEB_API_KEY?:string;OPENDOTA_API_KEY?:string};
  const values=await Promise.allSettled([fetchDota(link.steam_id,undefined,{apiKey:secrets.OPENDOTA_API_KEY})]);
  const errors:string[]=[];
  const providerStatus:Record<string,unknown>={};
  let refreshAfter=now+60000;
  const data=values.map((result,i)=>{
    const game=i===0?'dota':'cs';
    if(result.status==='fulfilled'){providerStatus[game]={status:'ok'};return {...result.value,syncIssue:null,fetchedAt:Date.now()};}
    const issue=providerIssue(result.reason,game);
    if(issue.retryAfterSeconds)refreshAfter=Math.max(refreshAfter,Date.now()+issue.retryAfterSeconds*1000);
    providerStatus[game]=issue;
    errors.push(issue.message);
    const old=i===0?link.dota_data:link.cs_data;
    if(old){const saved=JSON.parse(old);return {...saved,notice:saved.status==='error'?issue.message:saved.notice,syncIssue:issue};}
    return {source:issue.source,status:'error',matches:[],performance:null,winRate:null,notice:issue.message,syncIssue:issue};
  });
  await database().prepare('UPDATE steam_links SET dota_data=?,synced_at=?,refresh_after=? WHERE user_id=? AND steam_id=?').bind(data[0]?JSON.stringify(data[0]):null,Date.now(),refreshAfter,user.userId,link.steam_id).run();
  return json({account:publicLink(await getLink(user.userId)),errors,providerStatus});
}
