import { currentUser, database, getLink, json, publicLink, sameOrigin } from '../../../../lib/server';
export const dynamic='force-dynamic';
export async function GET() { const user=await currentUser();if(!user)return json({error:'Sign in to connect Steam.'},401);return json({account:publicLink(await getLink(user.userId))}); }
export async function DELETE(request:Request) {
  if(!sameOrigin(request))return json({error:'Invalid request origin'},403);
  const user=await currentUser();if(!user)return json({error:'Sign in required'},401);
  await database().batch([database().prepare('DELETE FROM steam_links WHERE user_id=?').bind(user.userId),database().prepare('DELETE FROM steam_attempts WHERE user_id=?').bind(user.userId)]);
  return json({account:null});
}
