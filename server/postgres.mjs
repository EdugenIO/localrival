import pg from 'pg';
// Millisecond timestamps exceed PostgreSQL INTEGER. Store them as BIGINT and
// parse them back to safe JS numbers, matching D1's route contract.
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Unsafe database integer');return n});
export function postgresSql(sql){let i=0;return sql.replace(/`/g,'"').replace(/\bINTEGER\b/gi,'BIGINT').replace(/json_extract\((\w+),'\$\.(\w+)'\)/g,(_,column,key)=>`((${column}::jsonb->>'${key}')::${['points','wins','eligibleMatches'].includes(key)?'double precision':'bigint'})`).replace(/\?/g,()=>'$'+ ++i)}
export function databaseAdapter(pool){
 const prepare=sql=>{const statement={sql:postgresSql(sql),values:[],bind(...values){return {...statement,values}},async first(){return (await pool.query(this.sql,this.values)).rows[0]||null},async all(){return {results:(await pool.query(this.sql,this.values)).rows}},async run(){const r=await pool.query(this.sql,this.values);return {success:true,changes:r.rowCount}}};return statement};
 return {prepare,async batch(statements){const client=await pool.connect();try{await client.query('BEGIN');const results=[];for(const s of statements)results.push(await client.query(s.sql,s.values));await client.query('COMMIT');return results}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}};
}
export function createPool(url){if(!url)throw Error('DATABASE_URL is required. Accounts must use persistent PostgreSQL.');return new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000})}
export async function initialize(pool){await pool.query(`CREATE TABLE IF NOT EXISTS steam_attempts (state_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE,return_to TEXT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS steam_links (user_id TEXT PRIMARY KEY,steam_id TEXT NOT NULL UNIQUE,linked_at BIGINT NOT NULL,dota_data TEXT,cs_data TEXT,synced_at BIGINT,refresh_after BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ladder_members (user_id TEXT PRIMARY KEY,steam_id TEXT NOT NULL UNIQUE,alias TEXT NOT NULL,postcode TEXT NOT NULL,joined_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS ladder_places (user_id TEXT PRIMARY KEY,locality TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS player_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS pages_handoffs (code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,challenge TEXT NOT NULL,expires_at BIGINT NOT NULL);
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS browser_data TEXT;
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS leaderboard_data TEXT;`)}
