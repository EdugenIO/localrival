import {headers} from 'next/headers';
import {database,json,sameOrigin} from '../../../../lib/server';
import {SESSION_COOKIE,cookieValue,sessionTable} from '../../../../lib/steam-session';
import {hashState} from '../../../../lib/steam-openid.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!sameOrigin(request))return json({error:'Invalid request origin'},403);const h=await headers();const token=cookieValue(h.get('cookie')||'',SESSION_COOKIE);if(token){await sessionTable(database());await database().prepare('DELETE FROM player_sessions WHERE token_hash=?').bind(await hashState(token)).run()}return new Response(JSON.stringify({signedOut:true}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`}})}
