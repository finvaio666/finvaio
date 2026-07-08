// scripts/run-sql.mjs — run a .sql file against Supabase Postgres.
// Usage: node --env-file=.env.local scripts/run-sql.mjs db/schema.sql
// Reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE from env. SSL required by Supabase.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) { console.error('usage: run-sql.mjs <path-to.sql>'); process.exit(1); }
const sql = readFileSync(file, 'utf8');

const client = new pg.Client({ ssl: { rejectUnauthorized: false } }); // host/user/etc from PG* env
await client.connect();
try {
  await client.query(sql);
  console.log(`✅ ran ${file}`);
} catch (e) {
  console.error(`❌ ${file} failed:`, e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
