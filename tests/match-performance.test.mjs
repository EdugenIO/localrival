import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDota,normalizeDota} from '../lib/game-data.mjs';
import {matchPerformance,dotaMode,matchPoints} from '../lib/match-performance.mjs';
import {dotaMatchesPath} from '../public/opendota-request.mjs';
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
  assert.equal(d.matches.length,5);assert.equal(d.name,null);assert.equal(d.performance.points,26);
  assert.deepEqual(d.performance.modeCounts,{Other:1,Normal:2,Ranked:1,Turbo:1});
  assert.equal(d.matches.find(m=>m.gameMode===23).mode,'Turbo');assert.equal(d.rankTier,undefined);
});
test('uses the latest 50 distinct completed results and awards abandoned matches zero',async()=>{
  const input=Array.from({length:55},(_,i)=>fixture(i+1,i%2?23:22,0,i%3!==0));
  input.push({...input[54]});input.push(fixture(56,22,0,true,{leaver_status:2}));input.push(fixture(57,22,0,true,{radiant_win:null}));
  const d=await fetchDota(steamId,async url=>Response.json(url.includes('/matches?')?input:{}));
  assert.equal(d.matches.length,50);assert.equal(new Set(d.matches.map(m=>m.id)).size,50);
  assert.equal(d.matches[0].id,56);assert.ok(!d.matches.some(m=>m.id===57));assert.equal(d.performance.excludedMatches,1);
  assert.equal(d.performance.points,d.performance.wins*3+d.performance.losses+d.performance.performancePoints);assert.equal(d.performance.eligibleMatches,49);
});
test('Turbo and normal receive the same base points; incomplete KDA earns no bonus',()=>{
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
test('profile overview keeps missing replay metrics distinct from zero and separates recorded totals',()=>{
  const d=normalizeDota({profile:{personaname:'Player'}},[fixture(1,23,0,true,{hero_id:27,gold_per_min:0}),fixture(2,23,0,false,{hero_id:27,gold_per_min:null}),fixture(3,22,0,true,{hero_id:5,gold_per_min:500})],{win:32,lose:35});
  assert.equal(d.lifetime.matches,67);assert.equal(d.matches.length,3);assert.equal(d.averages.goldPerMinute.value,250);assert.equal(d.averages.goldPerMinute.samples,2);assert.equal(d.averages.heroDamage,null);assert.deepEqual(d.heroes[0],{id:27,matches:2,wins:1});
});
test('requesting advanced stats preserves the hero, time, mode and KDA projections',()=>{
  const url=new URL(dotaMatchesPath(),'https://api.opendota.com');
  const fields=url.searchParams.getAll('project');
  for(const field of ['hero_id','start_time','duration','game_mode','lobby_type','kills','deaths','assists','leaver_status','gold_per_min','xp_per_min'])assert.ok(fields.includes(field),field);
});

test('KDA rewards kills and assists on wins and losses with a per-match cap',()=>{
 assert.deepEqual(matchPoints({won:true,kills:4,deaths:4,assists:8}),{base:3,bonus:3,total:6,kda:3});
 assert.equal(matchPoints({won:false,kills:1,deaths:4,assists:2}).total,1.8);
 assert.equal(matchPoints({won:true,kills:0,deaths:0,assists:18}).total,6);
 assert.equal(matchPoints({won:true,kills:1000,deaths:1,assists:1000}).bonus,3);
 assert.equal(matchPoints({won:true,kills:0,deaths:5,assists:0}).bonus,0);
 assert.equal(matchPoints({won:true,kills:NaN,deaths:1,assists:3}).bonus,0);
 assert.equal(matchPoints({won:true,kills:-1,deaths:1,assists:3}).bonus,0);
 assert.equal(matchPoints({won:true,abandoned:true,kills:30,deaths:0,assists:40}).total,0);
 const points=matchPerformance([{won:true,kills:1,deaths:3,assists:0},{won:false,kills:0,deaths:4,assists:3}]);
 assert.equal(points.basePoints,4);assert.equal(points.performancePoints,1.1);assert.equal(points.points,5.1);assert.equal(points.version,2);
});

test('normalization withholds KDA bonus when any KDA field is missing',()=>{
 for(const key of ['kills','deaths','assists']){
  const match=fixture(1,23,0);delete match[key];const data=normalizeDota(null,[match]);
  assert.equal(data.matches[0][key],null);assert.equal(data.performance.performancePoints,0);assert.equal(data.performance.points,3);
 }
});
