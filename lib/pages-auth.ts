import {createState,hashState} from './steam-openid.mjs';
export const PAGES_ORIGIN='https://edugenio.github.io';
export const PAGES_URL=PAGES_ORIGIN+'/localrival/';
export async function handoffTable(db:any){await db.prepare('CREATE TABLE IF NOT EXISTS pages_handoffs (code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,challenge TEXT NOT NULL,expires_at INTEGER NOT NULL)').run()}
export async function createHandoff(db:any,userId:string,challenge:string){await handoffTable(db);await db.prepare('DELETE FROM pages_handoffs WHERE expires_at<=?').bind(Date.now()).run();const code=createState();await db.prepare('INSERT INTO pages_handoffs (code_hash,user_id,challenge,expires_at) VALUES (?,?,?,?)').bind(await hashState(code),userId,challenge,Date.now()+120000).run();return code}
