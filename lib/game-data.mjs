import { steamAccountId } from './steam-openid.mjs';
async function getJson(url, fetcher) {
  const response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.status===429) throw new Error('The data provider is busy. Try again later.');
  if(!response.ok) throw new Error('Game data is unavailable or private. Try again later.');
  return response.json();
}
export async function fetchDota(steamId, fetcher=fetch) {
  const id=steamAccountId(steamId);
  const [profile,matches]=await Promise.all([getJson(`https://api.opendota.com/api/players/${id}`,fetcher),getJson(`https://api.opendota.com/api/players/${id}/recentMatches`,fetcher)]);
  if(!Array.isArray(matches)) throw new Error('Unexpected match data from OpenDota.');
  const recent=matches.slice(0,20).filter(m=>Number.isSafeInteger(m.match_id)&&typeof m.radiant_win==='boolean'&&Number.isInteger(m.player_slot)).map(m=>({id:m.match_id,won:(m.player_slot<128)===m.radiant_win,kills:m.kills??0,deaths:m.deaths??0,assists:m.assists??0,startedAt:m.start_time,duration:m.duration,ranked:m.lobby_type===7}));
  return {source:'OpenDota',name:typeof profile?.profile?.personaname==='string'?profile.profile.personaname:null,rankTier:Number.isInteger(profile.rank_tier)?profile.rank_tier:null,leaderboardRank:profile.leaderboard_rank??null,matches:recent,winRate:recent.length?Math.round(recent.filter(m=>m.won).length/recent.length*100):null,notice:recent.length?'Latest available completed matches; provider updates can be delayed.':'No public matches returned. In Dota 2, enable Expose Public Match Data; then allow time for the provider to update.'};
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
