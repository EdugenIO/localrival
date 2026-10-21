import {currentUser,database,getLink,json,publicLink,sameOrigin} from '../../../../lib/server';
import {steamAccountId} from '../../../../lib/steam-openid.mjs';
import {normalizeDota} from '../../../../lib/game-data.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  const link=await getLink(user.userId);if(!link)return json({error:'Connect Steam first.'},409);
  // Browser imports are personal snapshots, never proof for a competitive leaderboard.
  let raw='';if(!request.body)return json({error:'Missing profile data'},400);
  const reader=request.body.getReader();const decoder=new TextDecoder();let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>200000){await reader.cancel();return json({error:'Profile data is too large'},413)}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid profile data'},400)}
  const accountId=steamAccountId(link.steam_id);
  if(body.steamId!==link.steam_id||String(body.accountId)!==accountId||(body.profile?.profile?.account_id!==undefined&&String(body.profile.profile.account_id)!==accountId))return json({error:'This profile does not match your connected Steam account.'},403);
  if(!Array.isArray(body.matches)||body.matches.length>50)return json({error:'Expected up to 50 match records.'},400);
  let normalized;try{normalized=normalizeDota(body.profile,body.matches,body.totals)}catch{return json({error:'Invalid match records'},400)}
  const now=Date.now();
  const data={...normalized,syncMethod:'browser',leaderboardEligible:false,fetchedAt:now,browserRefreshAfter:now+60000,syncIssue:null};
  const saved=await database().prepare("UPDATE steam_links SET dota_data=?,synced_at=? WHERE user_id=? AND steam_id=? AND (dota_data IS NULL OR json_extract(dota_data,'$.browserRefreshAfter') IS NULL OR json_extract(dota_data,'$.browserRefreshAfter')<=?) RETURNING steam_id").bind(JSON.stringify(data),now,user.userId,link.steam_id,now).first();
  if(!saved)return json({error:'Please wait one minute between profile syncs.',account:publicLink(await getLink(user.userId))},429);
  return json({account:publicLink(await getLink(user.userId))});
}
