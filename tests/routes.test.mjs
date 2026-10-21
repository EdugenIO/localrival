import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { SITE_ORIGIN, OPENID_NS, STEAM_ENDPOINT, STATE_COOKIE } from '../lib/steam-openid.mjs';

const root=path.resolve(import.meta.dirname,'..');
async function setup(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(path.join(root,'drizzle/0000_flashy_alex_power.sql'),'utf8'));
  const session={user:{userId:'alice',email:'alice@example.test'},steamValid:true,failDota:false,rateLimited:false,calls:0};
  const db={prepare(text){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(text).all(...args)}},async first(){return sql.prepare(text).get(...args)||null},async run(){return sql.prepare(text).run(...args)}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
  const context=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,crypto,Request,Response,Headers,AbortSignal,Date,process:{env:{NODE_ENV:'production'}},fetch:async(url,options)=>{
    session.calls++;const target=String(url);
    if(target===STEAM_ENDPOINT){assert.equal(options.body.get('openid.mode'),'check_authentication');return new Response('is_valid:'+session.steamValid+'\n')}
    if(target.includes('opendota')){if(session.rateLimited)return new Response('',{status:429,headers:{'Retry-After':'300'}});if(session.failDota)return new Response('',{status:503});return Response.json(target.includes('/matches?')?[{match_id:1,player_slot:0,radiant_win:true,kills:1,deaths:0,assists:2}]:{profile:{personaname:'Alice'},rank_tier:43})}
    throw new Error('Unexpected external request');
  }});
  const modules=new Map();
  async function load(file){
    if(modules.has(file))return modules.get(file);
    if(file.endsWith('.json')){const mod=new vm.SyntheticModule(['default'],function(){this.setExport('default',JSON.parse(readFileSync(file,'utf8')))},{context});modules.set(file,mod);return mod;}
    const source=readFileSync(file,'utf8');
    const code=file.endsWith('.ts')?ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText:source;
    const mod=new vm.SourceTextModule(code,{context,identifier:file});modules.set(file,mod);
    await mod.link(async(spec,ref)=>{
      if(spec==='next/headers')return new vm.SyntheticModule(['headers'],function(){this.setExport('headers',async()=>new Headers({cookie:session.cookie||''}))},{context});
      if(spec==='cloudflare:workers')return new vm.SyntheticModule(['env'],function(){this.setExport('env',{DB:db})},{context});
      if(spec.endsWith('/chatgpt-auth'))return new vm.SyntheticModule(['getChatGPTUser'],function(){this.setExport('getChatGPTUser',async()=>session.user)},{context});
      let dep=path.resolve(path.dirname(ref.identifier),spec);if(!path.extname(dep))dep+='.ts';return load(dep);
    });return mod;
  }
  async function route(name){const mod=await load(path.join(root,'app/api',name,'route.ts'));if(mod.status!=='evaluated')await mod.evaluate();return mod.namespace}
  return {sql,session,route};
}
function callback(location,state,steamId='76561198000000001'){
  const url=new URL(location);const returnTo=url.searchParams.get('openid.return_to');const cb=new URL(returnTo);
  for(const [k,v]of Object.entries({ns:OPENID_NS,mode:'id_res',op_endpoint:STEAM_ENDPOINT,return_to:returnTo,claimed_id:'https://steamcommunity.com/openid/id/'+steamId,identity:'https://steamcommunity.com/openid/id/'+steamId,response_nonce:new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'nonce',signed:'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',assoc_handle:'test',sig:'test'}))cb.searchParams.set('openid.'+k,v);
  return new Request(cb,{headers:{cookie:STATE_COOKIE+'='+state}});
}
async function start(h){const route=await h.route('steam/start');const response=await route.GET();const location=response.headers.get('location');const state=new URL(new URL(location).searchParams.get('openid.return_to')).searchParams.get('state');return {location,state}}
test('one-use login is bound to the initiating Site user and browser cookie',async()=>{
  const h=await setup(),attempt=await start(h),ret=await h.route('steam/return');
  const wrongCookie=callback(attempt.location,'bad');assert.match((await ret.GET(wrongCookie)).headers.get('location'),/expired/);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,0);
  h.session.user={userId:'bob',email:'bob@example.test'};assert.match((await ret.GET(callback(attempt.location,attempt.state))).headers.get('location'),/expired/);
  h.session.user={userId:'alice',email:'alice@example.test'};assert.match((await ret.GET(callback(attempt.location,attempt.state))).headers.get('location'),/linked/);assert.equal(h.sql.prepare('SELECT steam_id FROM steam_links WHERE user_id=?').get('alice').steam_id,'76561198000000001');
  assert.match((await ret.GET(callback(attempt.location,attempt.state))).headers.get('location'),/expired/);assert.equal(h.session.calls,1);
});
test('failed Steam verification never creates an account link',async()=>{const h=await setup(),attempt=await start(h);h.session.steamValid=false;const ret=await h.route('steam/return');assert.match((await ret.GET(callback(attempt.location,attempt.state))).headers.get('location'),/failed/);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,0)});
test('one Steam account cannot be linked to two Site users',async()=>{const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));h.session.user={userId:'bob',email:'bob@example.test'};const b=await start(h);assert.match((await ret.GET(callback(b.location,b.state))).headers.get('location'),/already_linked/);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,1)});
test('account reads and deletes are isolated; anonymous and cross-origin access fail',async()=>{const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const account=await h.route('steam/account');h.session.user={userId:'bob',email:'bob@example.test'};assert.equal((await(await account.GET()).json()).account,null);await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,1);h.session.user={userId:'alice',email:'alice@example.test'};assert.equal((await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:'https://evil.example'}}))).status,403);h.session.user=null;assert.equal((await account.GET()).status,200)});
test('refresh persists provider results, enforces cooldown and preserves old data on an outage',async()=>{const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const sync=await h.route('games/sync');const req=()=>new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}});let data=await(await sync.POST(req())).json();assert.equal(data.account.dota.name,'Alice');assert.equal(data.account.cs.status,'not_configured');const fetchedAt=data.account.dota.fetchedAt;assert.equal((await sync.POST(req())).status,429);h.sql.prepare('UPDATE steam_links SET refresh_after=0').run();h.session.failDota=true;data=await(await sync.POST(req())).json();assert.equal(data.account.dota.fetchedAt,fetchedAt);assert.equal(data.errors.length,1);const account=await h.route('steam/account');await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,0);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_attempts').get().n,0)});
test('provider backoff persists and repeated refreshes do not call the provider',async()=>{
  const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));h.session.rateLimited=true;
  const sync=await h.route('games/sync');const request=()=>new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}});
  const before=Date.now();const data=await(await sync.POST(request())).json();
  assert.equal(data.providerStatus.dota.code,'rate_limited');assert.equal(data.account.dota.syncIssue.httpStatus,429);
  assert.ok(data.account.refreshAfter>=before+300000);const calls=h.session.calls;
  assert.equal((await sync.POST(request())).status,429);assert.equal(h.session.calls,calls);
  assert.equal(h.sql.prepare('SELECT refresh_after FROM steam_links').get().refresh_after,data.account.refreshAfter);
  h.sql.prepare('UPDATE steam_links SET refresh_after=0').run();h.session.rateLimited=false;h.session.failDota=true;
  const next=await(await sync.POST(request())).json();assert.equal(next.account.dota.syncIssue.httpStatus,503);assert.match(next.account.dota.notice,/server problem/);
});
test('browser profile sync is account-bound, recomputes scores, and leaves Counter-Strike data intact',async()=>{
  const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));
  h.sql.prepare('UPDATE steam_links SET cs_data=?').run(JSON.stringify({source:'Steam',status:'ok',stats:{total_kills:123}}));
  const route=await h.route('dota/browser-sync');
  const payload={steamId:'76561198000000001',accountId:'39734273',profile:{profile:{account_id:39734273,personaname:'Browser Player'}},totals:{win:32,lose:35},points:999,matches:[{match_id:99,radiant_win:true,player_slot:0,hero_id:27,game_mode:23,lobby_type:0,kills:0,deaths:1,assists:18,duration:1095}]};
  const request=(body=payload,origin=SITE_ORIGIN)=>new Request(SITE_ORIGIN+'/api/dota/browser-sync',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await route.POST(request(payload,'https://evil.example'))).status,403);
  assert.equal((await route.POST(request({...payload,accountId:'123'}))).status,403);
  const response=await route.POST(request());assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.account.dota.name,'Browser Player');assert.equal(data.account.dota.performance.points,6);assert.equal(data.account.dota.syncMethod,'browser');assert.equal(data.account.dota.leaderboardEligible,false);assert.equal(data.account.dota.lifetime.matches,67);assert.equal(data.account.cs.stats.total_kills,123);
  assert.equal((await route.POST(request())).status,429);
  h.session.user={userId:'bob',email:'bob@example.test'};assert.equal((await route.POST(request())).status,409);
  h.session.user=null;assert.equal((await route.POST(request())).status,401);
});
test('browser profile import limits input size before parsing',async()=>{
  const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const route=await h.route('dota/browser-sync');
  const response=await route.POST(new Request(SITE_ORIGIN+'/api/dota/browser-sync',{method:'POST',headers:{Origin:SITE_ORIGIN},body:'x'.repeat(200001)}));assert.equal(response.status,413);
});



test('live ladder requires opt-in, recalculates scores, hides account IDs and isolates membership',async()=>{
 const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));
 h.sql.prepare('UPDATE steam_links SET dota_data=? WHERE user_id=?').run(JSON.stringify({name:'Synced gamer',matches:[{won:true,abandoned:false},{won:false,abandoned:false},{won:true,abandoned:true}],performance:{points:99999},syncMethod:'browser',fetchedAt:123}),'alice');
 const route=await h.route('leaderboard');const req=body=>new Request(SITE_ORIGIN+'/api/leaderboard',{method:'POST',headers:{Origin:SITE_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await(await route.GET()).json()).players.length,0);
 assert.equal((await route.POST(req({alias:'Alice',postcode:'abcd'}))).status,400);
 assert.equal((await route.POST(req({alias:'Alice',postcode:'6000'}))).status,200);
 let data=await(await route.GET()).json();assert.equal(data.players.length,1);assert.equal(data.players[0].points,4);assert.equal(data.players[0].name,'Synced gamer');assert.equal('unverified' in data.players[0],false);assert.equal(data.membership.postcode,'6000');
 assert.equal((await route.POST(req({alias:'Forged name',postcode:'6027',locality:'Joondalup'}))).status,200);data=await(await route.GET()).json();assert.equal(data.players[0].name,'Synced gamer');assert.equal(data.players[0].postcode,'6027');assert.equal(data.players[0].location[0],'Joondalup');assert.equal(data.players[0].location[3],'Perth');
 assert.equal((await route.POST(req({postcode:'0800',locality:'Darwin City'}))).status,200);data=await(await route.GET()).json();assert.equal(data.membership.postcode,'0800');
 assert.equal((await route.POST(req({postcode:'6027',locality:'Made up town'}))).status,400);assert.equal(JSON.stringify(data).includes('7656119'),false);assert.equal(JSON.stringify(data).includes('user_id'),false);
 h.session.user={userId:'bob'};assert.equal((await route.POST(req({alias:'Bob',postcode:'6000'}))).status,409);await route.DELETE(new Request(SITE_ORIGIN+'/api/leaderboard',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal((await(await route.GET()).json()).players.length,1);
 h.session.user={userId:'alice'};assert.equal((await route.DELETE(new Request(SITE_ORIGIN+'/api/leaderboard',{method:'DELETE',headers:{Origin:'https://evil.example'}}))).status,403);
 await route.DELETE(new Request(SITE_ORIGIN+'/api/leaderboard',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal((await(await route.GET()).json()).players.length,0);
 h.session.user=null;assert.equal((await route.GET()).status,200);assert.equal((await route.POST(req({alias:'A',postcode:'6000'}))).status,401);
});


test('Steam-only login creates a persistent hashed session, returns to saved data, and signs out',async()=>{
 const h=await setup();h.session.user=null;const a=await start(h);const ret=await h.route('steam/return');let response=await ret.GET(callback(a.location,a.state));assert.match(response.headers.get('location'),/linked/);const sessionCookie=response.headers.getSetCookie().find(c=>c.startsWith('__Host-lr-session='));assert.ok(sessionCookie.includes('HttpOnly'));assert.ok(sessionCookie.includes('Secure'));h.session.cookie=sessionCookie.split(';')[0];
 const account=await h.route('steam/account');let data=await(await account.GET()).json();assert.equal(data.account.steamId,'76561198000000001');assert.equal(h.sql.prepare('SELECT token_hash FROM player_sessions').get().token_hash.includes(h.session.cookie.split('=')[1]),false);
 h.sql.prepare('UPDATE steam_links SET dota_data=?').run(JSON.stringify({name:'Saved player',matches:[]}));
 h.session.cookie='';const b=await start(h);response=await ret.GET(callback(b.location,b.state));h.session.cookie=response.headers.getSetCookie().find(c=>c.startsWith('__Host-lr-session=')).split(';')[0];data=await(await account.GET()).json();assert.equal(data.account.dota.name,'Saved player');
 const logout=await h.route('session/logout');assert.equal((await logout.POST(new Request(SITE_ORIGIN+'/api/session/logout',{method:'POST',headers:{Origin:SITE_ORIGIN}}))).status,204);assert.equal((await(await account.GET()).json()).account,null);
 h.session.cookie='__Host-lr-session='+ 'a'.repeat(64);assert.equal((await(await account.GET()).json()).account,null);
});
