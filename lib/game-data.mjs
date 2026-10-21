import { steamAccountId } from './steam-openid.mjs';
import { MATCH_WINDOW, dotaMode, matchPerformance } from './match-performance.mjs';
async function getJson(url, fetcher) {
  const response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(response.status===429) throw new Error('The data provider is busy. Try again later.');
  if(!response.ok) throw new Error('Game data is unavailable or private. Try again later.');
  return response.json();
}
export async function fetchDota(steamId, fetcher=fetch) {
  const id=steamAccountId(steamId);
  // significant=0 includes modes such as Turbo; do not apply ranked/mode filters.
  // Profile/medal availability must never prevent valid match history loading.
  const [profileResult,matches]=await Promise.all([getJson(`https://api.opendota.com/api/players/${id}`,fetcher).catch(()=>null),getJson(`https://api.opendota.com/api/players/${id}/matches?significant=0&limit=${MATCH_WINDOW}`,fetcher)]);
  const profile=profileResult;
  if(!Array.isArray(matches)) throw new Error('Unexpected match data from OpenDota.');
  const ids=new Set();
  const recent=matches.filter(m=>Number.isSafeInteger(m.match_id)&&typeof m.radiant_win==='boolean'&&Number.isInteger(m.player_slot)&&((m.player_slot>=0&&m.player_slot<=4)||(m.player_slot>=128&&m.player_slot<=132))).sort((a,b)=>(b.start_time||0)-(a.start_time||0)||b.match_id-a.match_id).filter(m=>{if(ids.has(m.match_id))return false;ids.add(m.match_id);return true}).slice(0,MATCH_WINDOW).map(m=>({id:m.match_id,won:(m.player_slot<128)===m.radiant_win,kills:m.kills??0,deaths:m.deaths??0,assists:m.assists??0,startedAt:m.start_time,duration:m.duration,gameMode:m.game_mode??null,lobbyType:m.lobby_type??null,mode:dotaMode(m.game_mode,m.lobby_type),abandoned:Number.isInteger(m.leaver_status)&&m.leaver_status>=2}));
  return {source:'OpenDota',name:typeof profile?.profile?.personaname==='string'?profile.profile.personaname:null,matches:recent,performance:matchPerformance(recent),winRate:recent.length?Math.round(recent.filter(m=>m.won).length/recent.length*100):null,notice:recent.length?'Latest available completed matches across all recorded modes, including Turbo and normal. Provider coverage and updates can vary.':'No public matches returned yet. If Expose Public Match Data is enabled, allow time for OpenDota to collect your matches. No score is assigned until matches are available.'};
}
export async function fetchCounterStrike(steamId, apiKey, fetcher=fetch) {
  if(!apiKey) return {status:'not_configured',source:'Steam',notice:'Counter-Strike stats need a server-side Steam Web API key. Steam linking still works. Competitive rating and match history are not supplied by this integration.'};
  const url=new URL('https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/');
  url.searchParams.set('key',apiKey);url.searchParams.set('steamid',steamId);url.searchParams.set('appid','730');
  const result=await getJson(url,fetcher);
  const stats=result?.playerstats?.stats;
  if(!Array.isArray(stats)) throw new Error('Counter-Strike stats are unavailable or private.');
  const allowed=new Set(['total_kills','total_deaths','total_wins','total_matches_played','total_rounds_played','total_shots_hit','total_shots_fired','total_kills_headshot']);
  return {status:'ok',source:'Steam',stats:Object.fromEntries(stats.filter(s=>allowed.has(s.name)&&typeof s.value==='number').map(s=>[s.name,s.value])),notice:'Cumulative app 730 stats returned by Steam. May include legacy CS:GO activity; these are not a current CS2 competitive rating or match history.'};
}
