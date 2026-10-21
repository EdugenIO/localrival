import { steamAccountId } from './steam-openid.mjs';
import { MATCH_WINDOW, dotaMode, matchPerformance } from './match-performance.mjs';
import { dotaMatchesPath } from '../public/opendota-request.mjs';
export class ProviderError extends Error {
  constructor(code,status=null,retryAfterSeconds=null){super(code);this.code=code;this.httpStatus=status;this.retryAfterSeconds=retryAfterSeconds;}
}
async function getJson(url, fetcher) {
  let response;
  try{response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch(error){
    const name=error?.name||'';
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
    let retryAfter=null;
    if(response.status===429){const header=response.headers.get('retry-after');const seconds=header&&/^\d+$/.test(header)?Number(header):header?Math.ceil((Date.parse(header)-Date.now())/1000):NaN;retryAfter=Number.isFinite(seconds)?Math.max(60,Math.min(3600,seconds)):600;}
    throw new ProviderError(code,response.status,retryAfter);
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
    rate_limited:`${source} is limiting requests (HTTP 429). Refresh is paused to let its quota recover. Your Steam connection and match-sharing setting do not need to be reset.`,
    provider_down:`${source} is having a server problem${status?' (HTTP '+status+')':''}. This does not mean your match data is private.`,
    access_denied:`${source} refused this data request${status?' (HTTP '+status+')':''}. Check the data connection and account access.`,
    not_found:game==='dota'?'OpenDota has no player record available yet. Public match collection may still be pending.':'Steam could not find stats for this game.',
    no_game_stats:'Steam reports no Counter-Strike stats for this account. This is separate from Steam sign-in.',
    private_stats:'Steam reports that these game stats are private. Check Steam profile and game-details visibility.',
    invalid_key:'Steam rejected the configured data API key. The app owner needs to replace it.',
    invalid_response:`${source} returned an unexpected response. Please try again later.`,
    provider_error:`${source} could not provide these game stats${status?' (HTTP '+status+')':''}.`,
  };
  return {source,code,httpStatus:status,message:messages[code],checkedAt:Date.now(),retryAfterSeconds:code==='rate_limited'?(error?.retryAfterSeconds||600):null};
}
export async function fetchDota(steamId, fetcher=fetch,options={}) {
  const id=steamAccountId(steamId);
  // significant=0 includes modes such as Turbo; do not apply ranked/mode filters.
  // Profile/medal availability must never prevent valid match history loading.
  const key=options.apiKey?'api_key='+encodeURIComponent(options.apiKey):'';
  const [profileResult,matches]=await Promise.all([getJson(`https://api.opendota.com/api/players/${id}${key?'?'+key:''}`,fetcher).catch(()=>null),getJson(`https://api.opendota.com/api/players/${id}${dotaMatchesPath(MATCH_WINDOW)}${key?'&'+key:''}`,fetcher)]);
  return normalizeDota(profileResult,matches);
}
export function normalizeDota(profile,matches,totals=null){
  if(!Array.isArray(matches)) throw new Error('Unexpected match data from OpenDota.');
  const ids=new Set();
  const recent=matches.filter(m=>Number.isSafeInteger(m.match_id)&&typeof m.radiant_win==='boolean'&&Number.isInteger(m.player_slot)&&((m.player_slot>=0&&m.player_slot<=4)||(m.player_slot>=128&&m.player_slot<=132))).sort((a,b)=>(b.start_time||0)-(a.start_time||0)||b.match_id-a.match_id).filter(m=>{if(ids.has(m.match_id))return false;ids.add(m.match_id);return true}).slice(0,MATCH_WINDOW).map(m=>({id:m.match_id,won:(m.player_slot<128)===m.radiant_win,kills:m.kills??0,deaths:m.deaths??0,assists:m.assists??0,startedAt:m.start_time,duration:m.duration,gameMode:m.game_mode??null,lobbyType:m.lobby_type??null,mode:dotaMode(m.game_mode,m.lobby_type),abandoned:Number.isInteger(m.leaver_status)&&m.leaver_status>=2}));
  for(const match of recent){const raw=matches.find(m=>m.match_id===match.id);match.heroId=Number.isInteger(raw.hero_id)?raw.hero_id:null;for(const [key,field]of Object.entries({goldPerMinute:'gold_per_min',xpPerMinute:'xp_per_min',lastHits:'last_hits',heroDamage:'hero_damage',healing:'hero_healing',towerDamage:'tower_damage'}))match[key]=typeof raw[field]==='number'&&Number.isFinite(raw[field])&&raw[field]>=0?raw[field]:null;}
  const averages={};for(const field of ['kills','deaths','assists','duration','goldPerMinute','xpPerMinute','lastHits','heroDamage','healing','towerDamage']){const available=recent.map(m=>m[field]).filter(v=>typeof v==='number'&&Number.isFinite(v));averages[field]=available.length?{value:available.reduce((a,b)=>a+b,0)/available.length,samples:available.length}:null;}
  const heroMap=new Map();for(const match of recent){if(!match.heroId)continue;const hero=heroMap.get(match.heroId)||{id:match.heroId,matches:0,wins:0};hero.matches++;if(match.won)hero.wins++;heroMap.set(match.heroId,hero);}
  const heroes=[...heroMap.values()].sort((a,b)=>b.matches-a.matches||b.wins-a.wins);
  const validTotal=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
  const lifetime=validTotal(totals?.win)&&validTotal(totals?.lose)?{wins:totals.win,losses:totals.lose,matches:totals.win+totals.lose,winRate:totals.win+totals.lose?Math.round(totals.win/(totals.win+totals.lose)*100):null}:null;
  return {source:'OpenDota',name:typeof profile?.profile?.personaname==='string'?profile.profile.personaname.slice(0,80):null,matches:recent,performance:matchPerformance(recent),averages,heroes,lifetime,winRate:recent.length?Math.round(recent.filter(m=>m.won).length/recent.length*100):null,notice:recent.length?'Latest available completed matches across all recorded modes, including Turbo and normal. Provider coverage and updates can vary.':'No public matches returned yet. If Expose Public Match Data is enabled, allow time for OpenDota to collect your matches. No score is assigned until matches are available.'};
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
