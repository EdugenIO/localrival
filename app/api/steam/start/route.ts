import { currentUser, database } from '../../../../lib/server';
import { createState, hashState, SITE_ORIGIN, STATE_COOKIE, steamLoginUrl } from '../../../../lib/steam-openid.mjs';
export const dynamic='force-dynamic';
export async function GET() {
  const user=await currentUser();

  const state=createState();
  const attemptUser=user?.userId||'pending:'+await hashState(state);
  const returnTo=SITE_ORIGIN+'/api/steam/return?state='+state;
  await database().batch([
    database().prepare('DELETE FROM steam_attempts WHERE expires_at < ?').bind(Date.now()),
    database().prepare('INSERT INTO steam_attempts (state_hash,user_id,return_to,expires_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state_hash=excluded.state_hash,return_to=excluded.return_to,expires_at=excluded.expires_at').bind(await hashState(state),attemptUser,returnTo,Date.now()+600000),
  ]);
  return new Response(null,{status:303,headers:{Location:steamLoginUrl(returnTo),'Cache-Control':'no-store','Set-Cookie':`${STATE_COOKIE}=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`}});
}
