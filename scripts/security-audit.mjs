import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function evaluateAudit(audit, lock, policy, today = new Date().toISOString().slice(0,10)) {
  const failures=[];const accepted=new Set();
  if(audit.error||audit.auditReportVersion!==2||!audit.vulnerabilities||!audit.metadata?.vulnerabilities)return {failures:['Missing or invalid npm audit report'],accepted:[]};
  function leaves(name,seen=new Set()) {
    if(seen.has(name))return [];
    seen.add(name);
    const entry=audit.vulnerabilities[name];
    if(!entry)return [{name, url:'unresolved dependency'}];
    return entry.via.flatMap(v=>typeof v==='string'?leaves(v,seen):[v]);
  }
  for(const [name,vulnerability]of Object.entries(audit.vulnerabilities)) {
    const advisories=leaves(name);
    if(!advisories.length){failures.push(name+': no advisory details');continue}
    for(const advisory of advisories) {
      const id=advisory.url?.split('/').pop();const exception=policy.advisories?.[id];
      const devOnly=vulnerability.nodes?.length&&vulnerability.nodes.every(path=>lock.packages?.[path]?.dev===true);
      if(exception&&exception.package===advisory.name&&exception.severity===advisory.severity&&policy.expiresAt>=today&&devOnly)accepted.add(id);
      else failures.push(name+': '+(id||'unknown advisory')+(exception&&!devOnly?' affects non-development dependencies':'')+(exception&&policy.expiresAt<today?' review expired':''));
    }
  }
  return {failures:[...new Set(failures)],accepted:[...accepted]};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(!process.env.npm_execpath)throw Error('Run this check with npm run security:audit');
    const result=spawnSync(process.execPath,[process.env.npm_execpath,'audit','--json'],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
    if(result.error||![0,1].includes(result.status))throw Error('npm audit could not complete');
    const audit=JSON.parse(result.stdout),lock=JSON.parse(readFileSync('package-lock.json','utf8')),policy=JSON.parse(readFileSync('security-audit-policy.json','utf8'));
    const evaluation=evaluateAudit(audit,lock,policy);
    console.log(JSON.stringify({counts:audit.metadata?.vulnerabilities,reviewedDevelopmentAdvisories:evaluation.accepted,reviewExpires:policy.expiresAt,failures:evaluation.failures},null,2));
    if(evaluation.failures.length)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1}
}
