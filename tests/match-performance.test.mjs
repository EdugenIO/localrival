import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDota} from '../lib/game-data.mjs';
import {matchPerformance,dotaMode} from '../lib/match-performance.mjs';
const steamId='76561198000000001';
const fixture=(id,game_mode,lobby_type,win=true,extra={})=>({match_id:id,player_slot:0,radiant_win:win,kills:4,deaths:2,assists:8,start_time:id,game_mode,lobby_type,...extra});
test('requests every available mode, includes Turbo and normal, and needs no ranked profile',async()=>{
  let matchUrl;
  const d=await fetchDota(steamId,async url=>{
    if(!url.includes('/matches?'))return new Response('',{status:404});
    matchUrl=new URL(url);
    return Response.json([fixture(1,23,0),fixture(2,22,0,false),fixture(3,22,7),fixture(4,18,0),fixture(5,999,99,false)]);
  });
  assert.equal(matchUrl.searchParams.get('significant'),'0');assert.equal(matchUrl.searchParams.get('limit'),'50');
  assert.equal(matchUrl.searchParams.has('game_mode'),false);assert.equal(matchUrl.searchParams.has('lobby_type'),false);
  assert.equal(d.matches.length,5);assert.equal(d.name,null);assert.equal(d.performance.points,11);
  assert.deepEqual(d.performance.modeCounts,{Other:1,Normal:2,Ranked:1,Turbo:1});
  assert.equal(d.matches.find(m=>m.gameMode===23).mode,'Turbo');assert.equal(d.rankTier,undefined);
});
test('uses the latest 50 distinct completed results and awards abandoned matches zero',async()=>{
  const input=Array.from({length:55},(_,i)=>fixture(i+1,i%2?23:22,0,i%3!==0));
  input.push({...input[54]});input.push(fixture(56,22,0,true,{leaver_status:2}));input.push(fixture(57,22,0,true,{radiant_win:null}));
  const d=await fetchDota(steamId,async url=>Response.json(url.includes('/matches?')?input:{}));
  assert.equal(d.matches.length,50);assert.equal(new Set(d.matches.map(m=>m.id)).size,50);
  assert.equal(d.matches[0].id,56);assert.ok(!d.matches.some(m=>m.id===57));assert.equal(d.performance.excludedMatches,1);
  assert.equal(d.performance.points,d.performance.wins*3+d.performance.losses);assert.equal(d.performance.eligibleMatches,49);
});
test('Turbo and normal receive the same points per result; KDA does not change points',()=>{
  const turbo=matchPerformance([{won:true,gameMode:23,lobbyType:0,kills:50}]);
  const normal=matchPerformance([{won:true,gameMode:22,lobbyType:0,kills:0}]);
  assert.equal(turbo.points,3);assert.equal(normal.points,3);
  assert.equal(matchPerformance([{won:false}]).points,1);
  assert.equal(matchPerformance([{won:true,abandoned:true}]).points,0);
  assert.equal(matchPerformance([]).eligibleMatches,0);
});
test('unknown modes are retained and labels preserve Turbo precedence',()=>{
  assert.equal(dotaMode(23,7),'Turbo');assert.equal(dotaMode(22,0),'Normal / other · All Draft');
  assert.equal(dotaMode(22,7),'Ranked · All Draft');assert.equal(dotaMode(999,99),'Normal / other · Other mode');
});
