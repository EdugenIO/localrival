import {mkdir,writeFile,rm} from 'node:fs/promises';
// Pages is a permanent entry link; the app and sessions live on the Render origin.
const origin='https://localrival-api.onrender.com';
await rm('pages-dist',{recursive:true,force:true});
await mkdir('pages-dist',{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${origin}/"><title>Local Rival has moved</title><link rel="canonical" href="${origin}/"></head><body><p>Local Rival is now hosted on Render. <a href="${origin}/">Open Local Rival</a>.</p></body></html>`;
await writeFile('pages-dist/index.html',html);
await writeFile('pages-dist/leaderboard.html',html);
await writeFile('pages-dist/.nojekyll','');
