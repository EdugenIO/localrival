import test from 'node:test';
import assert from 'node:assert/strict';
import { steamAccountId, steamLoginUrl, validateAssertion, verifyWithSteam, hashState, createState, SITE_ORIGIN, STEAM_ENDPOINT, OPENID_NS } from '../lib/steam-openid.mjs';
import { fetchDota, fetchCounterStrike } from '../lib/game-data.mjs';

const steamId='76561198000000001';
const returnTo=SITE_ORIGIN+'/api/steam/return?state=abc';
function assertion(){return new URLSearchParams({
  'openid.ns':OPENID_NS,'openid.mode':'id_res','openid.op_endpoint':STEAM_ENDPOINT,
  'openid.return_to':returnTo,'openid.claimed_id':'https://steamcommunity.com/openid/id/'+steamId,
  'openid.identity':'https://steamcommunity.com/openid/id/'+steamId,
  'openid.response_nonce':new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'nonce',
  'openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  'openid.assoc_handle':'test','openid.sig':'test-signature',
})}
test('login is sent only to Steam with the exact callback and realm',()=>{const u=new URL(steamLoginUrl(returnTo));assert.equal(u.origin,'https://steamcommunity.com');assert.equal(u.searchParams.get('openid.return_to'),returnTo);assert.equal(u.searchParams.get('openid.realm'),SITE_ORIGIN+'/');});
test('Steam ID conversion does not lose 64-bit precision',()=>{assert.equal(steamAccountId(steamId),'39734273');assert.throws(()=>steamAccountId('76561197960265727'));assert.throws(()=>steamAccountId('76561207960265728'));});
test('state has 256 random bits and is hashed before storage',async()=>{const a=createState(),b=createState();assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);assert.equal((await hashState(a)).length,64);assert.notEqual(await hashState(a),a)});
test('valid Steam assertion passes the local structural checks',()=>assert.equal(validateAssertion(assertion(),returnTo),steamId));
for(const [label,key,value] of [
  ['foreign issuer','openid.op_endpoint','https://evil.example/openid'],
  ['different return URL','openid.return_to',SITE_ORIGIN+'/api/steam/return?state=other'],
  ['different identity','openid.identity','https://steamcommunity.com/openid/id/76561198000000002'],
  ['foreign claimed ID','openid.claimed_id','https://evil.example/openid/id/'+steamId],
  ['unsigned identity','openid.signed','op_endpoint,return_to,response_nonce,assoc_handle'],
  ['old nonce','openid.response_nonce','2020-01-01T00:00:00Znonce'],
  ['missing signature','openid.sig',''],
])test('rejects '+label,()=>{const p=assertion();p.set(key,value);assert.throws(()=>validateAssertion(p,returnTo))});
test('duplicate callback parameters are rejected',()=>{const p=assertion();p.append('openid.claimed_id',p.get('openid.claimed_id'));assert.throws(()=>validateAssertion(p,returnTo))});
test('verification posts back only to Steam, rather than trusting a browser signature',async()=>{let called=false;await verifyWithSteam(assertion(),async(url,options)=>{called=true;assert.equal(url,STEAM_ENDPOINT);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.body.get('openid.mode'),'check_authentication');return new Response('ns:'+OPENID_NS+'\nis_valid:true\n')});assert.ok(called);await assert.rejects(verifyWithSteam(assertion(),async()=>new Response('is_valid:false\n')));await assert.rejects(verifyWithSteam(assertion(),async()=>new Response('error',{status:503})));});
test('Dota uses account ID, computes each team result, and does not invent MMR',async()=>{const d=await fetchDota(steamId,async url=>{assert.ok(url.includes('/players/39734273'));return Response.json(url.endsWith('recentMatches')?[
  {match_id:1,player_slot:0,radiant_win:true,kills:5,deaths:2,assists:10,lobby_type:7},
  {match_id:2,player_slot:128,radiant_win:true,kills:2,deaths:5,assists:1,lobby_type:0},
  {match_id:3,player_slot:129,radiant_win:false,kills:3,deaths:1,assists:4,lobby_type:7},
]:{profile:{personaname:'Test Player'},rank_tier:54})});assert.equal(d.winRate,67);assert.deepEqual(d.matches.map(m=>m.won),[true,false,true]);assert.equal(d.rankTier,54);assert.equal(d.mmr,undefined);assert.equal(d.matches[1].ranked,false);});
test('Dota missing public matches is an honest empty state',async()=>{const d=await fetchDota(steamId,async url=>Response.json(url.endsWith('recentMatches')?[]:{}));assert.equal(d.winRate,null);assert.equal(d.rankTier,null);assert.match(d.notice,/Expose Public Match Data/)});
test('provider errors and malformed match data are rejected',async()=>{await assert.rejects(fetchDota(steamId,async()=>new Response('',{status:429})));await assert.rejects(fetchDota(steamId,async()=>Response.json({})));});
test('Counter-Strike without key does not fake a connection or call Steam stats',async()=>{const c=await fetchCounterStrike(steamId,undefined,()=>{throw Error('Must not fetch')});assert.equal(c.status,'not_configured');assert.equal(c.stats,undefined)});
test('Counter-Strike exposes only allowed stats and never returns the key',async()=>{const c=await fetchCounterStrike(steamId,'fake-test-key',async url=>{assert.equal(url.hostname,'api.steampowered.com');assert.equal(url.searchParams.get('appid'),'730');return Response.json({playerstats:{stats:[{name:'total_kills',value:123},{name:'unexpected',value:999}]}})});assert.deepEqual(c.stats,{total_kills:123});assert.ok(!JSON.stringify(c).includes('fake-test-key'))});
