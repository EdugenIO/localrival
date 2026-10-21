import { currentUser, database } from '../../../../lib/server';
import { hashState, SITE_ORIGIN, STATE_COOKIE, validateAssertion, verifyWithSteam } from '../../../../lib/steam-openid.mjs';
export const dynamic='force-dynamic';
function finish(status:string) { return new Response(null,{status:303,headers:{Location:SITE_ORIGIN+'/leaderboard.html?steam='+status,'Cache-Control':'no-store','Set-Cookie':`${STATE_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`}}); }
export async function GET(request:Request) {
  const user=await currentUser();
  if(!user) return finish('expired');
  const params=new URL(request.url).searchParams;
  const state=params.get('state')||'';
  const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(STATE_COOKIE+'='))?.slice(STATE_COOKIE.length+1);
  if(!/^[a-f0-9]{64}$/.test(state)||cookie!==state) return finish('expired');
  const attempt=await database().prepare('DELETE FROM steam_attempts WHERE state_hash=? AND user_id=? AND expires_at>? RETURNING return_to').bind(await hashState(state),user.userId,Date.now()).first<{return_to:string}>();
  if(!attempt) return finish('expired');
  if(params.get('openid.mode')==='cancel') return finish('cancelled');
  try {
    const steamId=validateAssertion(params,attempt.return_to);
    await verifyWithSteam(params);
    const existing=await database().prepare('SELECT user_id FROM steam_links WHERE steam_id=?').bind(steamId).first<{user_id:string}>();
    if(existing && existing.user_id!==user.userId) return finish('already_linked');
    await database().prepare('INSERT INTO steam_links (user_id,steam_id,linked_at,refresh_after) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET steam_id=excluded.steam_id,linked_at=excluded.linked_at,dota_data=NULL,cs_data=NULL,synced_at=NULL,refresh_after=0').bind(user.userId,steamId,Date.now()).run();
    return finish('linked');
  } catch { return finish('failed'); }
}
