import { env } from 'cloudflare:workers';
import { currentUser, database, getLink, json, publicLink, sameOrigin } from '../../../../lib/server';
import { fetchDota, fetchCounterStrike } from '../../../../lib/game-data.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  const link=await getLink(user.userId);if(!link)return json({error:'Connect Steam first.'},409);
  const now=Date.now();
  const gate=await database().prepare('UPDATE steam_links SET refresh_after=? WHERE user_id=? AND steam_id=? AND refresh_after<=? RETURNING steam_id').bind(now+60000,user.userId,link.steam_id,now).first();
  if(!gate)return json({error:'Please wait one minute between refreshes.',account:publicLink(link)},429);
  const values=await Promise.allSettled([fetchDota(link.steam_id),fetchCounterStrike(link.steam_id,(env as Cloudflare.Env & {STEAM_WEB_API_KEY?:string}).STEAM_WEB_API_KEY)]);
  const errors:string[]=[];
  const data=values.map((result,i)=>{
    if(result.status==='fulfilled')return {...result.value,fetchedAt:Date.now()};
    errors.push(i===0?'Dota 2 could not refresh. Public match data may be disabled, or OpenDota may be unavailable.':'Counter-Strike could not refresh. Steam stats may be private or the provider may be unavailable.');
    const old=i===0?link.dota_data:link.cs_data;
    return old?JSON.parse(old):null;
  });
  await database().prepare('UPDATE steam_links SET dota_data=?,cs_data=?,synced_at=? WHERE user_id=? AND steam_id=?').bind(data[0]?JSON.stringify(data[0]):null,data[1]?JSON.stringify(data[1]):null,Date.now(),user.userId,link.steam_id).run();
  return json({account:publicLink(await getLink(user.userId)),errors});
}
