import pg from 'pg';
const c = new pg.Client({ ssl: { rejectUnauthorized: false } });
await c.connect();

const tables = (await c.query(
  `select table_name from information_schema.tables where table_schema='public' order by 1`
)).rows.map(r => r.table_name);

for (const t of tables) {
  const cols = (await c.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name=$1
      order by ordinal_position`, [t]
  )).rows;
  const cnt = (await c.query(`select count(*)::int as n from public."${t}"`)).rows[0].n;
  console.log(`\n### ${t}  (${cnt} rows)`);
  for (const col of cols) {
    console.log(`  ${col.column_name.padEnd(22)} ${col.data_type.padEnd(28)} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''} ${col.column_default ? 'def=' + col.column_default : ''}`);
  }
}
await c.end();
