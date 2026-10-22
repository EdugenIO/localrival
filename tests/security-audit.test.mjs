import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudit} from '../scripts/security-audit.mjs';
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
