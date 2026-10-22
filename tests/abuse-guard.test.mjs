import test from 'node:test';
import assert from 'node:assert/strict';
import {TokenBucket,clientKey,createAbuseGuard} from '../server/abuse-guard.mjs';
const request=(remote='203.0.113.9',forwarded)=>({socket:{remoteAddress:remote},headers:forwarded?{'x-forwarded-for':forwarded}:{}});

test('rate limits allow a burst, return a retry delay, and recover with time',()=>{
 let now=0;const bucket=new TokenBucket({capacity:2,refillPerSecond:0.5,now:()=>now});assert.ok(bucket.consume('alice').allowed);assert.ok(bucket.consume('alice').allowed);assert.deepEqual(bucket.consume('alice'),{allowed:false,retryAfter:2});assert.ok(bucket.consume('bob').allowed);now=2000;assert.ok(bucket.consume('alice').allowed);
});
test('limiter memory is bounded and expired buckets release capacity',()=>{
 let now=0;const bucket=new TokenBucket({capacity:1,refillPerSecond:1,maxKeys:2,now:()=>now});bucket.consume('a');bucket.consume('b');assert.equal(bucket.consume('c').allowed,false);now=1000;assert.ok(bucket.consume('c').allowed);
});
test('untrusted forwarding headers cannot rotate a local caller or spoofed prefix',()=>{
 assert.equal(clientKey(request()),clientKey(request('203.0.113.9','198.51.100.1')));
 assert.equal(clientKey(request('10.0.0.1','198.51.100.7, 203.0.113.9'),1),clientKey(request('10.0.0.1','198.51.100.8, 203.0.113.9'),1));
 assert.equal(clientKey(request('10.0.0.1','invalid'),1),clientKey(request('10.0.0.1')));
 assert.equal(clientKey(request('::ffff:203.0.113.9')),clientKey(request()));
});
test('abuse guard limits login separately and bounds aggregate traffic',()=>{
 const guard=createAbuseGuard({now:()=>0});for(let i=0;i<5;i++)assert.ok(guard(request(),'/api/steam/start').allowed);assert.equal(guard(request(),'/api/steam/start').allowed,false);assert.ok(guard(request(),'/api/leaderboard').allowed);assert.ok(guard(request(),'/health').allowed);
 for(let i=0;i<25;i++)assert.ok(guard(request('198.51.100.'+i),'/api/steam/start').allowed);
 assert.equal(guard(request('192.0.2.1'),'/api/steam/start').allowed,false);
});
