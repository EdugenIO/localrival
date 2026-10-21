import {createHandoff,PAGES_URL} from '../../../../lib/pages-auth';
import {createSession} from '../../../../lib/steam-session';
import { currentUser, database } from '../../../../lib/server';
import { hashState, SITE_ORIGIN, STATE_COOKIE, validateAssertion, verifyWithSteam } from '../../../../lib/steam-openid.mjs';
export const dynamic='force-dynamic';
function finish(status:string,sessionCookie?:string) {const headers=new Headers({Location:SITE_ORIGIN+'/leaderboard.html?steam='+status,'Cache-Control':'no-store'});headers.append('Set-Cookie',`${STATE_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);if(sessionCookie)headers.append('Set-Cookie',sessionCookie);return new Response(null,{status:303,headers});}
export async function GET(request:Request) {


  const params=new URL(request.url).searchParams;
  const pages=params.get('frontend')==='pages';
  const user=pages?null:await currentUser();
  const state=params.get('state')||'';
  const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(STATE_COOKIE+'='))?.slice(STATE_COOKIE.length+1);
  if(!/^[a-f0-9]{64}$/.test(state)||cookie!==state) return finish('expired');
  const attempt=await database().prepare('DELETE FROM steam_attempts WHERE state_hash=? AND user_id=? AND expires_at>? RETURNING return_to').bind(await hashState(state),user?.userId||'pending:'+await hashState(state),Date.now()).first<{return_to:string}>();
  if(!attempt) return finish('expired');
  if(params.get('openid.mode')==='cancel') return finish('cancelled');
  let stage='assertion';
  try {
    const steamId=validateAssertion(params,attempt.return_to);
    stage='steam';
    await verifyWithSteam(params);
    stage='storage';
    const existing=await database().prepare('SELECT user_id FROM steam_links WHERE steam_id=?').bind(steamId).first<{user_id:string}>();
    if(existing && user && existing.user_id!==user.userId) return finish('already_linked');
    const userId=existing?.user_id||user?.userId||'steam:'+steamId;
    if(!existing)await database().prepare('INSERT INTO steam_links (user_id,steam_id,linked_at,refresh_after) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET steam_id=excluded.steam_id,linked_at=excluded.linked_at,dota_data=NULL,cs_data=NULL,synced_at=NULL,refresh_after=0').bind(userId,steamId,Date.now()).run();
    if(pages){const challenge=new URL(attempt.return_to).searchParams.get('challenge')||'';if(!/^[a-f0-9]{64}$/.test(challenge))return finish('failed_assertion');const code=await createHandoff(database(),userId,challenge);const response=finish('linked');response.headers.set('Location',PAGES_URL+'#steam_ticket='+code);return response;}
    return finish('linked',await createSession(database(),userId));
  } catch {
    return finish('failed_'+stage);
  }
}
