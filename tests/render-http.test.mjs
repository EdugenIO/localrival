import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import path from 'node:path';
import {createAppServer} from '../server/http.mjs';

test('Render HTTP server serves the app, health, redirects, same-origin access and isolated headers',async()=>{
  const server=createAppServer({origin:'https://localrival.test',staticRoot:path.resolve('public'),healthCheck:async()=>{},runRequest:async(request,action)=>action(),handlers:{'/api/echo':{GET:async request=>Response.json({hostedIdentity:request.headers.get('oai-authenticated-user-id')}),POST:async()=>Response.json({ok:true})},'/api/steam/return':{GET:async()=>new Response(null,{status:303,headers:{Location:'/leaderboard.html?steam=cancelled','Set-Cookie':'test=1; HttpOnly'}})}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  try {
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/LOCALRIVAL/);assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(home.headers.get('referrer-policy'),'no-referrer');assert.equal(home.headers.get('x-frame-options'),'DENY');assert.equal(home.headers.get('strict-transport-security'),'max-age=31536000');
    const hero=await fetch(base+'/dota-hero-names.json');assert.equal(hero.status,200);
    assert.deepEqual(await(await fetch(base+'/health')).json(),{status:'ok',database:'connected'});
    assert.equal((await(await fetch(base+'/api/echo',{headers:{'oai-authenticated-user-id':'forged'}})).json()).hostedIdentity,null);
    const preflight=await fetch(base+'/api/echo',{method:'OPTIONS',headers:{Origin:'https://edugenio.github.io'}});assert.equal(preflight.status,403);assert.equal(preflight.headers.get('access-control-allow-origin'),null);
    assert.equal((await fetch(base+'/api/echo',{method:'OPTIONS',headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(base+'/api/echo',{method:'POST',headers:{Origin:'https://localrival.test'},body:'x'.repeat(210001)})).status,413);
    const returned=await fetch(base+'/api/steam/return',{redirect:'manual'});assert.equal(returned.status,303);assert.match(returned.headers.get('set-cookie'),/HttpOnly/);assert.equal((await fetch(base+returned.headers.get('location'))).status,200);
    assert.equal((await fetch(base+'/package.json')).status,404);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('Render rejects cross-origin mutations before reading the body or calling a handler',async()=>{
 let calls=0;const server=createAppServer({origin:'https://localrival.test',staticRoot:path.resolve('public'),healthCheck:async()=>{},runRequest:async(request,action)=>action(),handlers:{'/api/echo':{POST:async()=>{calls++;return Response.json({ok:true})}}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try {
  for(const origin of ['https://edugenio.github.io','https://evil.test']){const response=await fetch(base+'/api/echo',{method:'POST',headers:{Origin:origin},body:'data'});assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null)}
  assert.equal(calls,0);assert.equal((await fetch(base+'/api/echo',{method:'POST',headers:{Origin:'https://localrival.test'},body:'data'})).status,200);assert.equal(calls,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('Render throttles repeated logins before database work and reports Retry-After',async()=>{
 let calls=0;const server=createAppServer({origin:'https://localrival.test',staticRoot:path.resolve('public'),healthCheck:async()=>{},runRequest:async(request,action)=>action(),handlers:{'/api/steam/start':{GET:async()=>{calls++;return new Response(null,{status:303,headers:{Location:'https://steamcommunity.com/openid/login'}})}}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try {
  for(let i=0;i<5;i++)assert.equal((await fetch(base+'/api/steam/start',{redirect:'manual',headers:{'x-forwarded-for':'198.51.100.'+i}})).status,303);
  const limited=await fetch(base+'/api/steam/start',{redirect:'manual',headers:{'x-forwarded-for':'198.51.100.99'}});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);assert.equal(calls,5);assert.equal(limited.headers.get('cache-control'),'no-store');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
