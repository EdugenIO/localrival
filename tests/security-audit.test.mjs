import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudit,readAudit} from '../scripts/security-audit.mjs';
const policy={expiresAt:'2026-11-21',advisories:{'GHSA-reviewed':{package:'leaf',severity:'high'}}};
const advisory={name:'leaf',severity:'high',url:'https://github.com/advisories/GHSA-reviewed'};
const report=()=>({auditReportVersion:2,metadata:{vulnerabilities:{high:2}},vulnerabilities:{parent:{via:['leaf'],nodes:['node_modules/parent']},leaf:{via:[advisory],nodes:['node_modules/leaf']}}});
const lock={packages:{'node_modules/parent':{dev:true},'node_modules/leaf':{dev:true}}};
test('audit gate accepts only reviewed advisories throughout a development-only chain',()=>{assert.deepEqual(evaluateAudit(report(),lock,policy,'2026-10-22'),{failures:[],accepted:['GHSA-reviewed']})});
test('audit gate rejects unknown findings and production exposure',()=>{
 const unknown=report();unknown.vulnerabilities.leaf.via[0]={name:'leaf',url:'https://github.com/advisories/GHSA-new'};assert.ok(evaluateAudit(unknown,lock,policy,'2026-10-22').failures.length);
 const production={packages:{...lock.packages,'node_modules/parent':{dev:false}}};assert.match(evaluateAudit(report(),production,policy,'2026-10-22').failures[0],/non-development/);
});
test('audit gate expires exceptions and fails closed on registry errors or missing lock data',()=>{
 assert.ok(evaluateAudit(report(),lock,policy,'2026-11-22').failures.length);
 assert.ok(evaluateAudit({error:{code:'registry unavailable'}},lock,policy).failures.length);
 assert.ok(evaluateAudit(report(),{packages:{}},policy,'2026-10-22').failures.length);
});

const cleanReport={auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}};
const result=(report,status=0)=>({status,stdout:JSON.stringify(report),stderr:''});
const options={npmPath:'/npm-cli.js',log:()=>{}};
test('audit retries a registry outage and evaluates the recovered report',()=>{
 let calls=0;const actual=readAudit({...options,run:(_command,args,settings)=>{calls++;assert.ok(args.includes('--fetch-retries=0'));assert.equal(settings.timeout,22000);return calls===1?result({error:{code:'E503'}},1):result(cleanReport)}});assert.deepEqual(actual,cleanReport);assert.equal(calls,2);
});
test('audit retries subprocess timeouts but stops after three attempts without a verdict',()=>{
 let calls=0;assert.throws(()=>readAudit({...options,run:()=>{calls++;return {error:{code:'ETIMEDOUT'},status:null,stdout:'',stderr:''}}}),/unavailable after 3/);assert.equal(calls,3);
});
test('audit does not retry or suppress a valid report containing vulnerabilities',()=>{
 let calls=0;const findings=report();assert.deepEqual(readAudit({...options,run:()=>{calls++;return result(findings,1)}}),findings);assert.equal(calls,1);assert.ok(evaluateAudit(findings,{packages:{}},policy).failures.length);
});
test('audit fails immediately on malformed reports and authentication errors',()=>{
 for(const response of [{status:0,stdout:'not json',stderr:''},result({error:{code:'E401'}},1)]){let calls=0;assert.throws(()=>readAudit({...options,run:()=>{calls++;return response}}),/no security verdict/);assert.equal(calls,1)}
});
test('production audits omit development packages and preserve security findings',()=>{
 let args;assert.deepEqual(readAudit({...options,production:true,run:(_command,argv)=>{args=argv;return result(cleanReport)}}),cleanReport);assert.ok(args.includes('--omit=dev'));
});
test('audit recognizes transient HTTP failures in stderr without logging raw diagnostics',()=>{
 let calls=0;const logs=[];readAudit({...options,log:line=>logs.push(line),run:()=>++calls<3?{status:1,stdout:'',stderr:'npm warn audit 503 Service Unavailable https://private-registry.example'}:result(cleanReport)});assert.equal(calls,3);assert.equal(logs.length,2);assert.ok(logs.every(line=>!line.includes('private-registry')));
});
