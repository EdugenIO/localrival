import {headers} from 'next/headers';
import {sessionUser} from './steam-session';
import {matchPerformance,matchPoints} from './match-performance.mjs';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {SITE_ORIGIN} from './steam-openid.mjs';
import type {PlayerDatabase} from './database-types';

export function database(): PlayerDatabase {
  if (!env.DB) throw new Error('Player database unavailable');
  return env.DB as unknown as PlayerDatabase;
}
export function json(data: unknown, status=200) {return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export async function currentUser() {
  const h=await headers();
  return await sessionUser(database(),h.get('cookie')||'')||await getChatGPTUser();
}
export function sameOrigin(request: Request) {return request.headers.get('origin')===SITE_ORIGIN||(process.env.NODE_ENV!=='production'&&/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(request.headers.get('origin')||''))}
export type SteamLink = {user_id:string;steam_id:string;linked_at:number;dota_data:string|null;browser_data:string|null;leaderboard_data:string|null;cs_data:string|null;synced_at:number|null;refresh_after:number};
export async function getLink(userId: string) {return database().prepare('SELECT * FROM steam_links WHERE user_id=?').bind(userId).first<SteamLink>()}
export function publicLink(link: SteamLink|null) {
  if (!link) return null;
  let dota=link.browser_data?JSON.parse(link.browser_data):link.dota_data?JSON.parse(link.dota_data):null;
  if (Array.isArray(dota?.matches)) dota={...dota,performance:matchPerformance(dota.matches),matches:dota.matches.map((m: Parameters<typeof matchPoints>[0])=>({...m,scoring:matchPoints(m)}))};
  return {steamId:link.steam_id,linkedAt:link.linked_at,syncedAt:link.synced_at,dota,cs:link.cs_data?JSON.parse(link.cs_data):null,refreshAfter:link.refresh_after};
}
