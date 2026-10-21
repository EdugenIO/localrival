import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { SITE_ORIGIN } from './steam-openid.mjs';

export function database() { if(!env.DB) throw new Error('Player database unavailable');return env.DB; }
export function json(data:unknown,status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
export async function currentUser() { return getChatGPTUser(); }
export function sameOrigin(request:Request) { return request.headers.get('origin')===SITE_ORIGIN || (process.env.NODE_ENV!=='production' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(request.headers.get('origin')||'')); }
export type SteamLink = {user_id:string;steam_id:string;linked_at:number;dota_data:string|null;cs_data:string|null;synced_at:number|null;refresh_after:number};
export async function getLink(userId:string) { return database().prepare('SELECT * FROM steam_links WHERE user_id = ?').bind(userId).first<SteamLink>(); }
export function publicLink(link:SteamLink|null) { return link ? {steamId:link.steam_id,linkedAt:link.linked_at,syncedAt:link.synced_at,dota:link.dota_data?JSON.parse(link.dota_data):null,cs:link.cs_data?JSON.parse(link.cs_data):null,refreshAfter:link.refresh_after} : null; }
