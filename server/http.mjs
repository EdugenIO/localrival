import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const pagesOrigin='https://edugenio.github.io';
const assets=new Map([
  ['/','leaderboard.html'],['/leaderboard','leaderboard.html'],['/leaderboard.html','leaderboard.html'],
  ...['app.js','steam.js','style.css','steam.css','postcodes.json','dota-hero-names.json','opendota-request.mjs','favicon.svg'].map(name=>['/'+name,name]),
]);
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',svg:'image/svg+xml'};

export function createAppServer({origin,handlers,runRequest,healthCheck,staticRoot}) {
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/',origin);
      const headers=new Headers();
      for(const [key,value] of Object.entries(req.headers)) {
        if(key.startsWith('oai-authenticated-'))continue;
        if(Array.isArray(value)) for(const v of value) headers.append(key,v);
        else if(value)headers.set(key,value);
      }
      if(headers.get('origin')===pagesOrigin) {
        res.setHeader('Access-Control-Allow-Origin',pagesOrigin);res.setHeader('Vary','Origin');
        res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
      }
      res.setHeader('X-Content-Type-Options','nosniff');
      if(req.method==='OPTIONS'){res.writeHead(headers.get('origin')===pagesOrigin?204:403);res.end();return}
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
}
