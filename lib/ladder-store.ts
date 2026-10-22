import type {PlayerDatabase} from './database-types';

const ready = new WeakMap<PlayerDatabase, Promise<void>>();
export function prepareLadder(db: PlayerDatabase) {
  let pending = ready.get(db);
  if (!pending) {
    pending = (async () => {
      await db.prepare('CREATE TABLE IF NOT EXISTS ladder_members (user_id TEXT PRIMARY KEY, steam_id TEXT NOT NULL UNIQUE, alias TEXT NOT NULL, postcode TEXT NOT NULL, joined_at INTEGER NOT NULL)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS ladder_places (user_id TEXT PRIMARY KEY, locality TEXT NOT NULL)').run();
    })();
    ready.set(db, pending);
    pending.catch(() => ready.delete(db));
  }
  return pending;
}
