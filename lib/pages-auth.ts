import type {PlayerDatabase} from './database-types';
export async function handoffTable(db:PlayerDatabase){await db.prepare('CREATE TABLE IF NOT EXISTS pages_handoffs (code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,challenge TEXT NOT NULL,expires_at INTEGER NOT NULL)').run()}
