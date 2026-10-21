import {createState,hashState} from './steam-openid.mjs';
export const SESSION_COOKIE='__Host-lr-session';
export const SESSION_AGE=30*24*60*60;
export async function sessionTable(db:any){await db.prepare('CREATE TABLE IF NOT EXISTS player_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL)').run()}
export function cookieValue(cookie:string,name:string){return cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||''}
export async function sessionUser(db:any,cookie:string){const token=cookieValue(cookie,SESSION_COOKIE);if(!/^[a-f0-9]{64}$/.test(token))return null;await sessionTable(db);const row=await db.prepare('SELECT user_id FROM player_sessions WHERE token_hash=? AND expires_at>?').bind(await hashState(token),Date.now()).first();return row?{userId:row.user_id,displayName:'Steam player',email:'',fullName:null}:null}
export async function createSession(db:any,userId:string){await sessionTable(db);await db.prepare('DELETE FROM player_sessions WHERE expires_at<=?').bind(Date.now()).run();const token=createState();await db.prepare('INSERT INTO player_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await hashState(token),userId,Date.now()+SESSION_AGE*1000).run();return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_AGE}; Secure; HttpOnly; SameSite=Lax`}
