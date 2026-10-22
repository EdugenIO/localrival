import policy from '../public/policy.json';
import type {PlayerDatabase} from './database-types';
export const POLICY_VERSION=policy.version;
export async function prepareConsent(db:PlayerDatabase){await db.prepare('CREATE TABLE IF NOT EXISTS policy_acceptances (user_id TEXT NOT NULL,purpose TEXT NOT NULL,policy_version TEXT NOT NULL,accepted_at INTEGER NOT NULL,PRIMARY KEY(user_id,purpose))').run()}
export function consentStatement(db:PlayerDatabase,userId:string,purpose:string){return db.prepare('INSERT INTO policy_acceptances (user_id,purpose,policy_version,accepted_at) VALUES (?,?,?,?) ON CONFLICT(user_id,purpose) DO UPDATE SET policy_version=excluded.policy_version,accepted_at=excluded.accepted_at').bind(userId,purpose,POLICY_VERSION,Date.now())}
