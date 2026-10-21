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
  const session={user:{userId:'alice',email:'alice@example.test'},steamValid:true,failDota:false,calls:0};
  const db={prepare(text){let args=[];return {bind(...values){args=values;return this},async first(){return sql.prepare(text).get(...args)||null},async run(){return sql.prepare(text).run(...args)}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
  const context=vm.createContext({console,URL,URLSearchParams,TextEncoder,Uint8Array,crypto,Request,Response,AbortSignal,Date,process:{env:{NODE_ENV:'production'}},fetch:async(url,options)=>{
    session.calls++;const target=String(url);
    if(target===STEAM_ENDPOINT){assert.equal(options.body.get('openid.mode'),'check_authentication');return new Response('is_valid:'+session.steamValid+'\n')}
    if(target.includes('opendota')){if(session.failDota)return new Response('',{status:503});return Response.json(target.includes('/matches?')?[{match_id:1,player_slot:0,radiant_win:true,kills:1,deaths:0,assists:2}]:{profile:{personaname:'Alice'},rank_tier:43})}
    throw new Error('Unexpected external request');
  }});
  const modules=new Map();
  async function load(file){
    if(modules.has(file))return modules.get(file);
    const source=readFileSync(file,'utf8');
    const code=file.endsWith('.ts')?ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText:source;
    const mod=new vm.SourceTextModule(code,{context,identifier:file});modules.set(file,mod);
    await mod.link(async(spec,ref)=>{
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
test('account reads and deletes are isolated; anonymous and cross-origin access fail',async()=>{const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const account=await h.route('steam/account');h.session.user={userId:'bob',email:'bob@example.test'};assert.equal((await(await account.GET()).json()).account,null);await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,1);h.session.user={userId:'alice',email:'alice@example.test'};assert.equal((await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:'https://evil.example'}}))).status,403);h.session.user=null;assert.equal((await account.GET()).status,401)});
test('refresh persists provider results, enforces cooldown and preserves old data on an outage',async()=>{const h=await setup(),a=await start(h),ret=await h.route('steam/return');await ret.GET(callback(a.location,a.state));const sync=await h.route('games/sync');const req=()=>new Request(SITE_ORIGIN+'/api/games/sync',{method:'POST',headers:{Origin:SITE_ORIGIN}});let data=await(await sync.POST(req())).json();assert.equal(data.account.dota.name,'Alice');assert.equal(data.account.cs.status,'not_configured');const fetchedAt=data.account.dota.fetchedAt;assert.equal((await sync.POST(req())).status,429);h.sql.prepare('UPDATE steam_links SET refresh_after=0').run();h.session.failDota=true;data=await(await sync.POST(req())).json();assert.equal(data.account.dota.fetchedAt,fetchedAt);assert.equal(data.errors.length,1);const account=await h.route('steam/account');await account.DELETE(new Request(SITE_ORIGIN+'/api/steam/account',{method:'DELETE',headers:{Origin:SITE_ORIGIN}}));assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_links').get().n,0);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM steam_attempts').get().n,0)});

