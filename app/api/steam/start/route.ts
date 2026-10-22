import { currentUser, database, json } from '../../../../lib/server';
import { createState, hashState, SITE_ORIGIN, STATE_COOKIE, steamLoginUrl } from '../../../../lib/steam-openid.mjs';
export const dynamic='force-dynamic';
export async function GET(request?:Request) {
  if(request&&new URL(request.url).searchParams.get('frontend')==='pages')return json({error:'Sign in directly on Local Rival.'},410);
  const user=await currentUser();
  const state=createState();
  const attemptUser=user?.userId||'pending:'+await hashState(state);
  const returnTo=SITE_ORIGIN+'/api/steam/return?state='+state;
  const result=await database().batch([
    database().prepare('DELETE FROM steam_attempts WHERE expires_at < ?').bind(Date.now()),
    database().prepare('INSERT INTO steam_attempts (state_hash,user_id,return_to,expires_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM steam_attempts WHERE expires_at>?)<1000 OR EXISTS(SELECT 1 FROM steam_attempts WHERE user_id=?) ON CONFLICT(user_id) DO UPDATE SET state_hash=excluded.state_hash,return_to=excluded.return_to,expires_at=excluded.expires_at RETURNING state_hash').bind(await hashState(state),attemptUser,returnTo,Date.now()+600000,Date.now(),attemptUser),
  ]);
  const written=(result as {results?:unknown[];rows?:unknown[];meta?:{changes?:number};changes?:number}[])[1];
  if(!(written.rows?.length||written.results?.length||written.meta?.changes||written.changes))return json({error:'Sign-in is busy. Please retry shortly.'},429);
  return new Response(null,{status:303,headers:{Location:steamLoginUrl(returnTo),'Cache-Control':'no-store','Set-Cookie':`${STATE_COOKIE}=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`}});
}
