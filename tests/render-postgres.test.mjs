import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {databaseAdapter,initialize} from '../server/postgres.mjs';
const wrapper=db=>({query:async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql))[0]:db.query(sql,values),async connect(){return {...wrapper(db),release(){}}}});
test('PostgreSQL keeps player, postcode and login state after closing and reopening the database',async()=>{
 const root=path.resolve('work');await mkdir(root,{recursive:true});const folder=await mkdtemp(path.join(root,'postgres-test-'));let pg;
 try{
 pg=new PGlite(folder);await initialize(wrapper(pg));let db=databaseAdapter(wrapper(pg));const timestamp=Date.now();
 await db.prepare('INSERT INTO steam_links (user_id,steam_id,linked_at,dota_data) VALUES (?,?,?,?)').bind('test-user','76561198000000001',timestamp,JSON.stringify({name:'Test player',fetchedAt:timestamp,browserRefreshAfter:0,matches:[{won:true}]})).run();
 await db.prepare('INSERT INTO ladder_members (user_id,steam_id,alias,postcode,joined_at) VALUES (?,?,?,?,?)').bind('test-user','76561198000000001','Test player','6100',timestamp).run();
 await db.prepare('INSERT INTO player_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind('hashed-test-session','test-user',timestamp+100000).run();
 await pg.close();pg=new PGlite(folder);db=databaseAdapter(wrapper(pg));
 const player=await db.prepare('SELECT * FROM steam_links WHERE user_id=?').bind('test-user').first();assert.equal(JSON.parse(player.dota_data).name,'Test player');assert.equal(Number(player.linked_at),timestamp);
 assert.equal((await db.prepare('SELECT postcode FROM ladder_members WHERE user_id=?').bind('test-user').first()).postcode,'6100');
 assert.equal((await db.prepare('SELECT user_id FROM player_sessions WHERE token_hash=? AND expires_at>?').bind('hashed-test-session',timestamp).first()).user_id,'test-user');
 const old=await db.prepare("SELECT COALESCE(json_extract(dota_data,'$.fetchedAt'),0) AS fetched FROM steam_links WHERE steam_id=?").bind('76561198000000001').first();assert.equal(Number(old.fetched),timestamp);
 const updated=await db.prepare("UPDATE steam_links SET synced_at=? WHERE user_id=? AND json_extract(dota_data,'$.browserRefreshAfter')<=? RETURNING steam_id").bind(timestamp,'test-user',timestamp).first();assert.equal(updated.steam_id,'76561198000000001');
 await assert.rejects(db.batch([db.prepare('DELETE FROM ladder_members WHERE user_id=?').bind('test-user'),db.prepare('INSERT INTO nonexistent_table (id) VALUES (?)').bind(1)]));assert.ok(await db.prepare('SELECT * FROM ladder_members WHERE user_id=?').bind('test-user').first());
 }finally{await pg?.close();assert.ok(folder.startsWith(root+path.sep));await rm(folder,{recursive:true,force:true})}
});
