import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {env} from './shims/env';
import {requestContext} from './shims/context';
import {createPool,databaseAdapter,initialize} from './postgres.mjs';
import * as account from '../app/api/steam/account/route';
import * as start from '../app/api/steam/start/route';
import * as callback from '../app/api/steam/return/route';
import * as exchange from '../app/api/session/exchange/route';
import * as logout from '../app/api/session/logout/route';
import * as leaderboard from '../app/api/leaderboard/route';
import * as sync from '../app/api/games/sync/route';
import * as browserSync from '../app/api/dota/browser-sync/route';
import * as nightly from '../app/api/jobs/dota/route';
import {PAGES_ORIGIN} from '../lib/pages-auth';
const origin=process.env.RUNTIME_SITE_ORIGIN||process.env.RENDER_EXTERNAL_URL;if(!origin||!origin.startsWith('https://')&&process.env.NODE_ENV==='production')throw Error('A fixed HTTPS backend origin is required');
const pool=createPool(process.env.DATABASE_URL);await initialize(pool);env.DB=databaseAdapter(pool);
const routes:Record<string,any>={'/api/steam/account':account,'/api/steam/start':start,'/api/steam/return':callback,'/api/session/exchange':exchange,'/api/session/logout':logout,'/api/leaderboard':leaderboard,'/api/games/sync':sync,'/api/dota/browser-sync':browserSync,'/api/jobs/dota':nightly};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url||'/',origin);const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(key.startsWith('oai-authenticated-'))continue;if(Array.isArray(value))for(const v of value)headers.append(key,v);else if(value)headers.set(key,value)}
 const allowed=headers.get('origin')===PAGES_ORIGIN;const cors=()=>{if(allowed){res.setHeader('Access-Control-Allow-Origin',PAGES_ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Max-Age','600')}};cors();
 if(req.method==='OPTIONS'){res.writeHead(allowed?204:403);res.end();return}
 if(url.pathname==='/health'){await pool.query('SELECT 1');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'ok',database:'connected'}));return}
 if(url.pathname==='/'){res.writeHead(302,{Location:PAGES_ORIGIN+'/localrival/'});res.end();return}
 const route=routes[url.pathname];if(!route||!route[req.method||'GET']){res.writeHead(route?405:404);res.end();return}
 // Bound uploads before passing them to the shared route handlers.
 let body:Buffer|undefined;if(req.method!=='GET'&&req.method!=='HEAD'){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>210000){res.writeHead(413);res.end();return}chunks.push(chunk)}body=Buffer.concat(chunks)}
 const request=new Request(url,{method:req.method,headers,body:body as any});const response=await requestContext.run(request,()=>route[req.method||'GET'](request));res.statusCode=response.status;for(const [key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);if(response.body)Readable.fromWeb(response.body as any).pipe(res);else res.end();
 }catch{console.error('Request failed; private request details withheld');if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Server unavailable. Please retry; saved data is retained.'}))}});
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Local Rival backend ready'));
process.on('SIGTERM',()=>{server.close(()=>{pool.end().finally(()=>process.exit(0))})});
