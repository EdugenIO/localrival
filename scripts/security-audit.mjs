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


// Retry transport failures only. A vulnerability report is always evaluated immediately.
export function readAudit({production=false,run=spawnSync,npmPath=process.env.npm_execpath,log=console.error}={}) {
  if(!npmPath)throw Error('Run this check with npm run security:audit');
  const args=[npmPath,'audit','--json','--fetch-timeout=8000','--fetch-retries=0',...(production?['--omit=dev']:[])];
  for(let attempt=1;attempt<=3;attempt++) {
    const result=run(process.execPath,args,{encoding:'utf8',timeout:22000,maxBuffer:4*1024*1024});
    let report;try{report=JSON.parse(result.stdout)}catch{}
    const valid=!report?.error&&report?.auditReportVersion===2&&report.vulnerabilities&&report.metadata?.vulnerabilities;
    if(!result.error&&[0,1].includes(result.status)&&valid)return report;
    const diagnostic=[result.error?.code,report?.error?.code,report?.error?.summary,result.stderr].filter(Boolean).join(' ');
    const transient=/ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|network timeout|\bE?(?:429|502|503|504)\b/i.test(diagnostic);
    if(!transient)throw Error('npm audit did not return a valid security report; no security verdict is available.');
    if(attempt===3)throw Error('npm audit registry/network unavailable after 3 bounded attempts; no security verdict is available.');
    log('npm audit registry/network request failed; retrying ('+attempt+'/3).');
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const production=process.argv.includes('--production');
    const audit=readAudit({production});
    if(production){
      const failures=Object.entries(audit.vulnerabilities).filter(([,entry])=>['moderate','high','critical'].includes(entry.severity)).map(([name,entry])=>name+': '+entry.severity);
      console.log(JSON.stringify({scope:'production',counts:audit.metadata.vulnerabilities,failures},null,2));
      if(failures.length)process.exitCode=1;
    }else{
      const lock=JSON.parse(readFileSync('package-lock.json','utf8')),policy=JSON.parse(readFileSync('security-audit-policy.json','utf8'));
      const evaluation=evaluateAudit(audit,lock,policy);
      console.log(JSON.stringify({counts:audit.metadata?.vulnerabilities,reviewedDevelopmentAdvisories:evaluation.accepted,reviewExpires:policy.expiresAt,failures:evaluation.failures},null,2));
      if(evaluation.failures.length)process.exitCode=1;
    }
  }catch(error){console.error(error.message);process.exitCode=1}
}
