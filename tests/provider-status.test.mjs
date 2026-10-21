import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDota,fetchCounterStrike,providerIssue,ProviderError} from '../lib/game-data.mjs';
test('outage messages preserve HTTP status and do not blame privacy',async()=>{
  let issue;try{await fetchDota('76561198000000001',async()=>new Response('',{status:521}))}catch(error){issue=providerIssue(error,'dota')}
  assert.equal(issue.code,'provider_down');assert.equal(issue.httpStatus,521);assert.match(issue.message,/does not mean your match data is private/);
});
test('Steam no-stats response is separate from invalid key and privacy',async()=>{
  let issue;try{await fetchCounterStrike('76561198000000001','not-a-real-key',async()=>Response.json({playerstats:{error:'Requested app has no stats'}},{status:400}))}catch(error){issue=providerIssue(error,'cs')}
  assert.equal(issue.code,'no_game_stats');assert.equal(issue.httpStatus,400);assert.match(issue.message,/no Counter-Strike stats/);
});
test('raw provider errors and credentials never enter client diagnostic messages',()=>{
  const issue=providerIssue(new Error('key=super-secret '+ 'https://provider.example/private'),'cs');
  assert.equal(issue.code,'invalid_response');assert.ok(!JSON.stringify(issue).includes('super-secret'));assert.ok(!JSON.stringify(issue).includes('provider.example'));
  assert.equal(providerIssue(new ProviderError('rate_limited',429),'dota').code,'rate_limited');
});
