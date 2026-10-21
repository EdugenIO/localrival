import {mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
await rm('pages-dist',{recursive:true,force:true});await mkdir('pages-dist',{recursive:true});await cp('public','pages-dist',{recursive:true});
let html=await readFile('public/leaderboard.html','utf8');html=html.replace('href="/steam.css"','href="./steam.css"').replace('<script src="app.js"></script><script src="/steam.js"></script>','<script type="module" src="./pages-bootstrap.mjs"></script>');
await writeFile('pages-dist/index.html',html);await writeFile('pages-dist/leaderboard.html',html);await writeFile('pages-dist/.nojekyll','');
for(const file of ['app.js','steam.js']){let source=await readFile('public/'+file,'utf8');for(const asset of ['postcodes.json','dota-hero-names.json','opendota-request.mjs'])source=source.replaceAll("'/"+asset+"'","'./"+asset+"'");await writeFile('pages-dist/'+file,source)}
