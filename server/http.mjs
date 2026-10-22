import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createAbuseGuard} from './abuse-guard.mjs';
const assets=new Map([
  ['/','leaderboard.html'],['/leaderboard','leaderboard.html'],['/leaderboard.html','leaderboard.html'],
  ...['app.js','steam.js','style.css','steam.css','postcodes.json','dota-hero-names.json','opendota-request.mjs','favicon.svg'].map(name=>['/'+name,name]),
]);
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',svg:'image/svg+xml'};

export function createAppServer({origin,handlers,runRequest,healthCheck,staticRoot,trustedProxyHops=0,abuseGuard=createAbuseGuard({trustedProxyHops})}) {
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/',origin);
      const headers=new Headers();
      for(const [key,value] of Object.entries(req.headers)) {
        if(key.startsWith('oai-authenticated-'))continue;
        if(Array.isArray(value)) for(const v of value) headers.append(key,v);
        else if(value)headers.set(key,value);
      }

      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('X-Frame-Options','DENY');
      res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
      if(new URL(origin).protocol==='https:')res.setHeader('Strict-Transport-Security','max-age=31536000');
      if(req.method==='OPTIONS'){res.writeHead(headers.get('origin')===new URL(origin).origin?204:403);res.end();return}
      if(url.pathname.startsWith('/api/')&&['POST','DELETE','PUT','PATCH'].includes(req.method)&&!url.pathname.startsWith('/api/jobs/')&&headers.get('origin')!==new URL(origin).origin){res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Invalid request origin'}));return}
      const quota=abuseGuard(req,url.pathname);
      if(!quota.allowed){res.writeHead(429,{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(quota.retryAfter)});res.end(JSON.stringify({error:'Too many requests. Please wait and retry.'}));return}
      if(url.pathname==='/health') {
        await healthCheck();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
        res.end(JSON.stringify({status:'ok',database:'connected'}));return;
      }
      const asset=assets.get(url.pathname);
      if(asset && ['GET','HEAD'].includes(req.method)) {
        const body=await readFile(resolve(staticRoot,asset));
        res.setHeader('Content-Type',types[asset.split('.').pop()]||'application/octet-stream');
        res.setHeader('Cache-Control','no-cache');
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://shared.fastly.steamstatic.com; connect-src 'self' https://api.opendota.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        res.statusCode=200;res.end(req.method==='HEAD'?undefined:body);return;
      }
      const route=handlers[url.pathname];
      if(!route||!route[req.method]){res.writeHead(route?405:404);res.end();return}
      let body;
      if(!['GET','HEAD'].includes(req.method)) {
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>210000){res.writeHead(413);res.end();return}chunks.push(chunk)}
        body=Buffer.concat(chunks);
      }
      const request=new Request(url,{method:req.method,headers,body});
      const response=await runRequest(request,()=>route[req.method](request));
      res.statusCode=response.status;
      for(const [key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
      if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
    } catch(error) {
      console.error('Request failed',{category:error?.code||error?.name||'unknown'});
      if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({error:'Server unavailable. Please retry; saved data is retained.'}));
    }
  });
  server.headersTimeout=15000;server.requestTimeout=30000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;
  return server;
}
