import pg from 'pg';
async function main() {
  const c = new pg.Client({ ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = await c.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype='c'
    order by conname`);
  console.log('tasks check constraints:', q.rows);
  // distinct existing type/status values actually present
  const t = await c.query(`select type, count(*)::int n from tasks group by type order by n desc`);
  console.log('existing type values:', t.rows);
  const s = await c.query(`select status, count(*)::int n from tasks group by status order by n desc`);
  console.log('existing status values:', s.rows);
  await c.end();
}
main();
