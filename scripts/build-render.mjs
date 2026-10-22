import {cp} from 'node:fs/promises';
import {build} from 'esbuild';
import path from 'node:path';
await build({entryPoints:['server/app.ts'],outfile:'render-dist/server.mjs',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',plugins:[{name:'render-platform',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:path.resolve('server/shims/env.ts')}));b.onResolve({filter:/^next\/headers$/},()=>({path:path.resolve('server/shims/context.ts')}));b.onResolve({filter:/chatgpt-auth$/},()=>({path:path.resolve('server/shims/auth.ts')}))}}]});

await cp('public','render-dist/public',{recursive:true});
