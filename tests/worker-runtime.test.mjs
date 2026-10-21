import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';

for(const adapter of ['steam','dota','cs'])test(adapter+' uses request options supported by the deployed Worker runtime',async()=>{
  const helper=readFileSync(new URL('../lib/steam-openid.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
  const games=readFileSync(new URL('../lib/game-data.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const worker=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:helper+readFileSync(new URL('../lib/match-performance.mjs',import.meta.url),'utf8').replace(/^export /gm,'')+readFileSync(new URL('../public/opendota-request.mjs',import.meta.url),'utf8').replace(/^export /gm,'')+games+`
    export default {async fetch(){
      try {
        const provider=async(url,options)=>{
          // Native fetch constructs a Request from these options in production.
          new Request(url,options);
          if(String(url).includes('/openid/'))return new Response('is_valid:true\\n');
          if(String(url).includes('/matches?'))return Response.json([]);
          if(String(url).includes('GetUserStats'))return Response.json({playerstats:{stats:[]}});
          return Response.json({profile:{personaname:'Runtime test'},rank_tier:35});
        };
        if('${adapter}'==='steam')await verifyWithSteam(new URLSearchParams(),provider);
        if('${adapter}'==='dota')await fetchDota('76561198000000001',provider);
        if('${adapter}'==='cs')await fetchCounterStrike('76561198000000001','fake-test-key',provider);
        return new Response('PASS');
      }catch(error){return new Response(error.name+': '+error.message,{status:500})}
    }};
  `});
  try{const response=await worker.dispatchFetch('http://localhost/');const text=await response.text();assert.equal(response.status,200,text)}finally{await worker.dispose()}
});

