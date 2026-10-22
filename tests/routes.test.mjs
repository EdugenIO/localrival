import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {databaseAdapter,initialize} from '../server/postgres.mjs';
import { SITE_ORIGIN, OPENID_NS, STEAM_ENDPOINT, STATE_COOKIE } from '../lib/steam-openid.mjs';

const root=path.resolve(import.meta.dirname,'..');
async function setup(externalDb){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(path.join(root,'drizzle/0000_flashy_alex_power.sql'),'utf8'));
  sql.exec(readFileSync(path.join(root,'drizzle/0001_verified_snapshots.sql'),'utf8'));
  const session={user:{userId:'alice',email:'alice@example.test'},steamValid:true,failDota:false,rateLimited:false,emptyDota:false,beforeMatches:null,calls:0};
  const db={prepare(text){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(text).all(...args)}},async first(){return sql.prepare(text).get(...args)||null},async run(){return sql.prepare(text).run(...args)}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
  const context=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,crypto,Request,Response,Headers,AbortSignal,Date,process:{env:{NODE_ENV:'production'}},fetch:async(url,options)=>{
    session.calls++;const target=String(url);
    if(target===STEAM_ENDPOINT){assert.equal(options.body.get('openid.mode'),'check_authentication');return new Response('is_valid:'+session.steamValid+'\n')}
    if(target.includes('opendota')){if(target.includes('/matches?')&&session.beforeMatches)await session.beforeMatches();if(target.includes('/matches?')&&session.emptyDota)return Response.json([]);if(session.rateLimited)return new Response('',{status:429,headers:{'Retry-After':'300'}});if(session.failDota)return new Response('',{status:503});return Response.json(target.includes('/matches?')?[{match_id:1,player_slot:0,radiant_win:true,kills:1,deaths:0,assists:2}]:{profile:{personaname:'Alice'},rank_tier:43})}
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
      if(spec==='next/headers')return new vm.SyntheticModule(['headers'],function(){this.setExport('headers',async()=>new Headers({cookie:session.cookie||'',...(session.authorization?{authorization:session.authorization}:{})}))},{context});
      if(spec==='cloudflare:workers')return new vm.SyntheticModule(['env'],function(){this.setExport('env',{DB:externalDb||db,NIGHTLY_SYNC_TOKEN:'test-job-token'})},{context});
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
test('refresh persists provider results, enforces cooldown and preserves old data on an outage',async()=>{const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const sync=await h.route('games/sync');const req=()=>new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}});let data=await(await sync.POST(req())).json();assert.equal(data.account.dota.name,'Alice');assert.equal(data.account.cs,null);const fetchedAt=data.account.dota.fetchedAt;assert.equal((await sync.POST(req())).status,429);h.sql.prepare('UPDATE steam_links SET refresh_after=0').run();h.session.failDota=true;data=await(await sync.POST(req())).json();assert.equal(data.account.dota.fetchedAt,fetchedAt);assert.equal(data.errors.length,1);const account=await h.route('steam/account');await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,0);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_attempts').get().n,0)});
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
 h.sql.prepare('UPDATE steam_links SET dota_data=?,leaderboard_data=? WHERE user_id=?').run(JSON.stringify({name:'Synced gamer',matches:[{won:true,abandoned:false},{won:false,abandoned:false},{won:true,abandoned:true}],performance:{points:99999},syncMethod:'server',leaderboardEligible:true,fetchedAt:123}),JSON.stringify({name:'Synced gamer',points:4,basePoints:4,performancePoints:0,eligibleMatches:2,wins:1,form:'WLA',fetchedAt:123,provisional:true}),'alice');
 const route=await h.route('leaderboard');const req=body=>new Request(SITE_ORIGIN+'/api/leaderboard',{method:'POST',headers:{Origin:SITE_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await(await route.GET()).json()).players.length,0);
 assert.equal((await route.POST(req({alias:'Alice',postcode:'abcd'}))).status,400);
 assert.equal((await route.POST(req({alias:'Alice',postcode:'6000'}))).status,200);
 let data=await(await route.GET()).json();assert.equal(data.players.length,1);assert.equal(data.players[0].points,4);assert.equal(data.players[0].name,'Synced gamer');assert.equal('unverified' in data.players[0],false);assert.equal(data.membership.postcode,'6000');
 assert.equal((await route.POST(req({alias:'Forged name',postcode:'6027',locality:'Joondalup'}))).status,200);data=await(await route.GET()).json();assert.equal(data.players[0].name,'Synced gamer');assert.equal(data.players[0].locationLabel,'Western Australia, Australia');assert.equal('postcode' in data.players[0],false);assert.equal('location' in data.players[0],false);assert.equal(data.membership.locality,'Joondalup');
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
 const logout=await h.route('session/logout');assert.equal((await logout.POST(new Request(SITE_ORIGIN+'/api/session/logout',{method:'POST',headers:{Origin:SITE_ORIGIN}}))).status,200);assert.equal((await(await account.GET()).json()).account,null);
 h.session.cookie='__Host-lr-session='+ 'a'.repeat(64);assert.equal((await(await account.GET()).json()).account,null);
});

test('nightly writer requires its secret, selects stale accounts, and preserves newer manual syncs',async()=>{
 const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const route=await h.route('jobs/dota');
 const request=(body,token='test-job-token')=>new Request(SITE_ORIGIN+'/api/jobs/dota',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await route.GET(request(null,'wrong'))).status,401);
 const page=await(await route.GET(request())).json();assert.equal(page.accounts.length,1);
 const payload={...page.accounts[0],profile:{profile:{account_id:Number(page.accounts[0].accountId),personaname:'Night player'}},matches:[{match_id:8,player_slot:0,radiant_win:true,kills:1,deaths:1,assists:2}]};
 assert.equal((await(await route.POST(request(payload))).json()).saved,true);assert.equal((await(await route.GET(request())).json()).accounts.length,0);
 assert.equal((await(await route.POST(request(payload))).json()).skipped,true);assert.equal((await route.POST(request(payload,'wrong'))).status,401);
 const saved=JSON.parse(h.sql.prepare('SELECT dota_data FROM steam_links').get().dota_data);assert.equal(saved.syncMethod,'nightly');assert.equal(saved.performance.points,6);
 const empty={...payload,expectedFetchedAt:saved.fetchedAt,matches:[]};await route.POST(request(empty));assert.equal(JSON.parse(h.sql.prepare('SELECT dota_data FROM steam_links').get().dota_data).matches.length,1);
});

test('retired Pages sign-in and token exchange cannot issue sessions',async()=>{
 const h=await setup();h.session.user=null;
 const startRoute=await h.route('steam/start');const response=await startRoute.GET(new Request(SITE_ORIGIN+'/api/steam/start?frontend=pages&challenge='+'b'.repeat(64)));
 assert.equal(response.status,410);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM steam_attempts').get().n,0);
 const exchange=await h.route('session/exchange');assert.equal((await exchange.POST(new Request(SITE_ORIGIN+'/api/session/exchange',{method:'POST',headers:{Origin:'https://edugenio.github.io'},body:JSON.stringify({code:'a'.repeat(64),verifier:'b'.repeat(64)})}))).status,410);
});

test('empty manual refresh retains populated verified history and ladder summary',async()=>{
 const h=await setup(),a=await start(h);await(await h.route('steam/return')).GET(callback(a.location,a.state));const route=await h.route('games/sync');
 const req=()=>new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}});
 await route.POST(req());const old=h.sql.prepare('SELECT dota_data,leaderboard_data FROM steam_links').get();h.sql.prepare('UPDATE steam_links SET refresh_after=0').run();h.session.emptyDota=true;
 const result=await(await route.POST(req())).json();assert.match(result.errors[0],/retained/);assert.deepEqual(h.sql.prepare('SELECT dota_data,leaderboard_data FROM steam_links').get(),old);
});

test('a slow manual sync cannot overwrite a newer provider snapshot',async()=>{
 const h=await setup(),a=await start(h);await(await h.route('steam/return')).GET(callback(a.location,a.state));
 const newer=JSON.stringify({name:'Newer player',fetchedAt:Date.now()+1000,matches:[{won:false}]});
 h.session.beforeMatches=async()=>{h.sql.prepare('UPDATE steam_links SET dota_data=?').run(newer)};
 const result=await(await(await h.route('games/sync')).POST(new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}}))).json();
 assert.equal(result.superseded,true);assert.equal(h.sql.prepare('SELECT dota_data FROM steam_links').get().dota_data,newer);
});

test('retired Pages callbacks cannot complete a login or create a handoff',async()=>{
 const h=await setup();h.session.user=null;const ret=await h.route('steam/return');
 const response=await ret.GET(new Request(SITE_ORIGIN+'/api/steam/return?frontend=pages&state='+'a'.repeat(64)));
 assert.equal(response.headers.get('location'),SITE_ORIGIN+'/leaderboard.html?steam=expired');assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM steam_links').get().n,0);
});

test('browser imports preserve an existing verified public score',async()=>{
 const h=await setup(),a=await start(h);await(await h.route('steam/return')).GET(callback(a.location,a.state));
 await(await h.route('games/sync')).POST(new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}}));
 const ladder=await h.route('leaderboard');await ladder.POST(new Request(SITE_ORIGIN+'/api/leaderboard',{method:'POST',headers:{Origin:SITE_ORIGIN},body:JSON.stringify({postcode:'6000'})}));
 const before=(await(await ladder.GET()).json()).players[0];
 const matches=Array.from({length:50},(_,i)=>({match_id:1000+i,player_slot:0,radiant_win:true,kills:30,deaths:0,assists:30}));
 const response=await(await h.route('dota/browser-sync')).POST(new Request(SITE_ORIGIN+'/api/dota/browser-sync',{method:'POST',headers:{Origin:SITE_ORIGIN},body:JSON.stringify({steamId:'76561198000000001',accountId:'39734273',profile:{profile:{personaname:'Forged name'}},matches})}));
 assert.equal(response.status,200);assert.equal((await response.json()).account.dota.performance.points,300);
 assert.deepEqual((await(await ladder.GET()).json()).players[0],before);
});

test('public ladder returns bounded ranked pages and server-side location scopes',async()=>{
 const h=await setup();h.session.user=null;const ladder=await h.route('leaderboard');await ladder.GET();
 for(let i=0;i<105;i++){
  const uid='player'+i,id=String(76561198000000000n+BigInt(i));const postcode=i===104?'2000':'6000';
  h.sql.prepare('INSERT INTO steam_links(user_id,steam_id,linked_at,leaderboard_data)VALUES(?,?,0,?)').run(uid,id,JSON.stringify({name:uid,points:i/10,basePoints:0,performancePoints:i/10,wins:1,eligibleMatches:1,form:'W',fetchedAt:123,provisional:true}));
  h.sql.prepare('INSERT INTO ladder_members VALUES(?,?,?,?,0)').run(uid,id,uid,postcode);h.sql.prepare('INSERT INTO ladder_places VALUES(?,?)').run(uid,postcode==='6000'?'Perth':'Sydney');
 }
 const page=await(await ladder.GET(new Request(SITE_ORIGIN+'/api/leaderboard?scope=country'))).json();assert.equal(page.players.length,100);assert.equal(page.nextOffset,100);assert.equal(page.players[0].points,10.4);
 const tail=await(await ladder.GET(new Request(SITE_ORIGIN+'/api/leaderboard?scope=country&offset=100'))).json();assert.equal(tail.players.length,5);assert.equal(tail.nextOffset,null);
 const local=await(await ladder.GET(new Request(SITE_ORIGIN+'/api/leaderboard?scope=postcode&postcode=2000'))).json();assert.equal(local.players.length,1);assert.equal(local.players[0].locationLabel,'New South Wales, Australia');assert.equal('postcode' in local.players[0],false);
 assert.equal((await ladder.GET(new Request(SITE_ORIGIN+'/api/leaderboard?scope=state&postcode=bad'))).status,400);
});

test('disconnect removes membership, locality and pending handoffs before reconnect',async()=>{
 const h=await setup(),a=await start(h);await(await h.route('steam/return')).GET(callback(a.location,a.state));await(await h.route('leaderboard')).GET();
 h.sql.exec("CREATE TABLE pages_handoffs(code_hash TEXT PRIMARY KEY,user_id TEXT,challenge TEXT,expires_at INTEGER);INSERT INTO ladder_members VALUES('alice','76561198000000001','Alice','6000',1);INSERT INTO ladder_places VALUES('alice','Perth');INSERT INTO pages_handoffs VALUES('hash','alice','challenge',9999999999999)");
 await(await h.route('steam/account')).DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));
 for(const table of ['ladder_members','ladder_places','ladder_privacy','pages_handoffs','player_sessions','steam_links','steam_attempts'])assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 const b=await start(h);await(await h.route('steam/return')).GET(callback(b.location,b.state));assert.equal((await(await(await h.route('leaderboard')).GET()).json()).membership,null);
});

test('the actual leaderboard route executes scoped fractional-score queries on PostgreSQL',async()=>{
 const pg=new PGlite();
 const pool={query:async(sql,values)=>!values&&sql.includes(';')?(await pg.exec(sql))[0]:pg.query(sql,values)};
 try {
  await initialize(pool);const db=databaseAdapter(pool),h=await setup(db);h.session.user=null;
  for(const [uid,postcode,locality,points]of [['alice','6000','Perth',4.7],['bob','6000','Perth',4.2],['carol','2000','Sydney',6]]){
   const id='7656119800000000'+(uid==='alice'?'1':uid==='bob'?'2':'3');
   await db.prepare('INSERT INTO steam_links(user_id,steam_id,linked_at,leaderboard_data)VALUES(?,?,0,?)').bind(uid,id,JSON.stringify({name:uid,points,basePoints:3,performancePoints:points-3,eligibleMatches:1,wins:1,form:'W',fetchedAt:123,provisional:true})).run();
   await db.prepare('INSERT INTO ladder_members VALUES(?,?,?,?,0)').bind(uid,id,uid,postcode).run();await db.prepare('INSERT INTO ladder_places VALUES(?,?)').bind(uid,locality).run();
  }
  pool.connect=async()=>({...pool,release(){}});
  const startRoute=await h.route('steam/start');const login=await startRoute.GET(new Request(SITE_ORIGIN+'/api/steam/start'));assert.equal(login.status,303);
  const ladder=await h.route('leaderboard');
  for(const scope of ['postcode','city','state']){
   const response=await ladder.GET(new Request(SITE_ORIGIN+'/api/leaderboard?scope='+scope+'&postcode=6000&locality=Perth'));assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.players.map(p=>p.points),[4.7,4.2]);
  }
  const national=await(await ladder.GET(new Request(SITE_ORIGIN+'/api/leaderboard?scope=country'))).json();assert.equal(national.players[0].name,'carol');
 }finally{await pg.close()}
});

test('player authentication accepts only HttpOnly cookies, never a bearer header',async()=>{
 const h=await setup();h.session.user=null;const a=await start(h);const signed=await(await h.route('steam/return')).GET(callback(a.location,a.state));const cookie=signed.headers.getSetCookie().find(c=>c.startsWith('__Host-lr-session=')).split(';')[0];
 h.session.authorization='Bearer '+cookie.split('=')[1];const account=await h.route('steam/account');assert.equal((await(await account.GET()).json()).account,null);
 h.session.cookie=cookie;assert.ok((await(await account.GET()).json()).account);
 const response=await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:'https://edugenio.github.io'}}));assert.equal(response.status,403);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM steam_links').get().n,1);
});

test('anonymous login attempts stop at the pending budget and resume after expiry',async()=>{
 const h=await setup();h.session.user=null;
 const insert=h.sql.prepare('INSERT INTO steam_attempts VALUES(?,?,?,?)');for(let i=0;i<1000;i++)insert.run('state'+i,'pending:'+i,'https://unused.test',Date.now()+600000);
 const route=await h.route('steam/start');assert.equal((await route.GET()).status,429);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM steam_attempts').get().n,1000);
 h.sql.prepare('UPDATE steam_attempts SET expires_at=0').run();assert.equal((await route.GET()).status,303);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM steam_attempts').get().n,1);
});


test('suburb visibility defaults private, needs a boolean opt-in, and can be revoked',async()=>{
 const h=await setup(),a=await start(h);await(await h.route('steam/return')).GET(callback(a.location,a.state));
 await(await h.route('games/sync')).POST(new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}}));
 const ladder=await h.route('leaderboard');const save=body=>ladder.POST(new Request(SITE_ORIGIN+'/api/leaderboard',{method:'POST',headers:{Origin:SITE_ORIGIN},body:JSON.stringify({postcode:'6027',locality:'Joondalup',...body})}));
 assert.equal((await save({})).status,200);
 const own=await(await ladder.GET()).json();assert.equal(own.membership.showSuburb,false);assert.equal(own.membership.locality,'Joondalup');
 const publicRead=async()=>{h.session.user=null;const data=await(await ladder.GET()).json();h.session.user={userId:'alice'};assert.equal(data.membership,null);assert.equal(data.gamerName,null);const player=data.players[0];for(const key of ['postcode','locality','location','user_id','steam_id'])assert.equal(key in player,false);return player};
 assert.equal((await publicRead()).locationLabel,'Western Australia, Australia');
 assert.equal((await save({showSuburb:'true'})).status,400);assert.equal((await publicRead()).locationLabel,'Western Australia, Australia');
 assert.equal((await save({showSuburb:true})).status,200);assert.equal((await publicRead()).locationLabel,'Joondalup, WA');
 assert.equal((await save({showSuburb:false})).status,200);assert.equal((await publicRead()).locationLabel,'Western Australia, Australia');
 h.sql.prepare('DELETE FROM ladder_privacy').run();assert.equal((await publicRead()).locationLabel,'Western Australia, Australia');
 await save({showSuburb:true});await ladder.DELETE(new Request(SITE_ORIGIN+'/api/leaderboard',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM ladder_privacy').get().n,0);
});
