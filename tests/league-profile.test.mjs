import test from 'node:test';
import assert from 'node:assert/strict';
import {leagueIdentity,parseLeagueProfile,fetchLeagueProfile} from '../lib/league-profile.mjs';
const identity=leagueIdentity('Test Player#OC','oce');
const html=(name='Test Player#OC',result='WIN',kills=4)=>`<script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'Person',name},{'@type':'ProfilePage',dateModified:'2026-10-01T00:00:00Z'},{'@type':'ItemList','@id':'x#recent-games',itemListElement:[{item:{startTime:'2026-10-01T00:00:00Z',additionalProperty:Object.entries({champion:'Lux',queueType:'NORMAL',result,kills,deaths:2,assists:8}).map(([name,value])=>({name,value}))}}]}]})}</script>`;
test('Riot IDs form only fixed OP.GG URLs and invalid input is rejected',()=>{
 assert.equal(identity.url,'https://op.gg/lol/summoners/oce/Test%20Player-OC');
 for(const [id,region] of [['Name','oce'],['Name#OC','evil'],['https://evil.test#OC','oce'],['Name#OC#x','oce'],['Name#../x','oce']])assert.throws(()=>leagueIdentity(id,region));
});
test('structured stats are matched to the requested identity and preserve real match results',()=>{
 const p=parseLeagueProfile(html(),identity,123);assert.equal(p.matches.length,1);assert.equal(p.matches[0].assists,8);assert.equal(p.ownershipVerified,false);assert.equal(p.fetchedAt,123);assert.equal(p.source,'OP.GG');
 assert.throws(()=>parseLeagueProfile(html('Someone Else#OC'),identity));assert.throws(()=>parseLeagueProfile('<h1>Challenge</h1>',identity));
 assert.equal(parseLeagueProfile(html('Test Player#OC','UNKNOWN'),identity).matches.length,0);
 assert.equal(parseLeagueProfile(html('Test Player#OC','WIN',-1),identity).matches.length,0);
});
test('successful server previews are cached to avoid repeated upstream requests',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(html(),{headers:{'Content-Type':'text/html'}})};
 const first=await fetchLeagueProfile(identity,fetcher);const second=await fetchLeagueProfile(identity,fetcher);assert.equal(calls,1);assert.deepEqual(first,second);
});
