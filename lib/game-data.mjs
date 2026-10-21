import { steamAccountId } from './steam-openid.mjs';
import { MATCH_WINDOW, dotaMode, matchPerformance } from './match-performance.mjs';
export class ProviderError extends Error {
  constructor(code,status=null){super(code);this.code=code;this.httpStatus=status;}
}
async function getJson(url, fetcher) {
  let response;
  try{response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch(error){
    const name=error?.name||'';
    const message=String(error?.message||'').replace(/https?:\/\/\S+/g,'[provider-url]').replace(/[a-z0-9+/=]{20,}/gi,'[redacted]').slice(0,180);
    console.error('[DEBUG-provider-request]',JSON.stringify({provider:String(url).includes('opendota')?'OpenDota':'Steam',type:name,message}));
    throw new ProviderError(/timeout|abort/i.test(name)?'timeout':'network_error');
  }
  if(!response.ok){
    let code=response.status===429?'rate_limited':response.status>=500?'provider_down':response.status===401||response.status===403?'access_denied':response.status===404?'not_found':'provider_error';
    if(String(url).includes('steampowered.com')&&response.status===400){
      let body='';try{body=await response.text()}catch{}
      if(/no stats|no statistics/i.test(body))code='no_game_stats';
      else if(/private|not public/i.test(body))code='private_stats';
      else if(/invalid.*key|key.*invalid/i.test(body))code='invalid_key';
    }
    throw new ProviderError(code,response.status);
  }
  try{return await response.json()}catch{throw new ProviderError('invalid_response',response.status)}
}
export function providerIssue(error,game){
  const source=game==='dota'?'OpenDota':'Steam';
  const codes=new Set(['timeout','network_error','rate_limited','provider_down','access_denied','not_found','provider_error','no_game_stats','private_stats','invalid_key','invalid_response']);
  const code=codes.has(error?.code)?error.code:'invalid_response';
  const status=Number.isInteger(error?.httpStatus)?error.httpStatus:null;
  const messages={
    timeout:`${source} did not respond in time. Try again later.`,
    network_error:`The app could not reach ${source}. Your Steam connection is still valid.`,
    rate_limited:`${source} is limiting requests. Wait before refreshing again.`,
    provider_down:`${source} is having a server problem${status?' (HTTP '+status+')':''}. This does not mean your match data is private.`,
    access_denied:`${source} refused this data request${status?' (HTTP '+status+')':''}. Check the data connection and account access.`,
    not_found:game==='dota'?'OpenDota has no player record available yet. Public match collection may still be pending.':'Steam could not find stats for this game.',
    no_game_stats:'Steam reports no Counter-Strike stats for this account. This is separate from Steam sign-in.',
    private_stats:'Steam reports that these game stats are private. Check Steam profile and game-details visibility.',
    invalid_key:'Steam rejected the configured data API key. The app owner needs to replace it.',
    invalid_response:`${source} returned an unexpected response. Please try again later.`,
    provider_error:`${source} could not provide these game stats${status?' (HTTP '+status+')':''}.`,
  };
  return {source,code,httpStatus:status,message:messages[code],checkedAt:Date.now()};
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
