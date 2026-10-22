import {prepareLadder} from '../../../../lib/ladder-store';
import {handoffTable} from '../../../../lib/pages-auth';
import {sessionTable,SESSION_COOKIE} from '../../../../lib/steam-session';
import { currentUser, database, getLink, json, publicLink, sameOrigin } from '../../../../lib/server';
export const dynamic='force-dynamic';
export async function GET() { const user=await currentUser();if(!user)return json({account:null});return json({account:publicLink(await getLink(user.userId))}); }
export async function DELETE(request:Request) {
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  await sessionTable(database());await prepareLadder(database());await handoffTable(database());
  await database().batch([database().prepare('DELETE FROM ladder_privacy WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM ladder_members WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM ladder_places WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM pages_handoffs WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM player_sessions WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM steam_links WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM steam_attempts WHERE user_id=?').bind(user.userId)]);
  const response=json({account:null});response.headers.set('Set-Cookie',`${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);return response;
}
