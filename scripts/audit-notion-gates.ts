/**
 * scripts/audit-notion-gates.ts
 * Guard against ungated Notion access.
 *   node --import tsx scripts/audit-notion-gates.ts
 *
 * Every file that instantiates a Notion client must either branch on a
 * DATA_SOURCE_* flag or be explicitly allowlisted below. Without this, a new
 * route can quietly read/write Notion and nothing fails until cutover freezes
 * Notion — at which point reads go stale and writes vanish. That is exactly how
 * the seven Phase 3.5 gaps survived Phases 2 and 3.
 *
 * Run before any cutover, and whenever a route that touches Notion is added.
 *
 * LIMITS — this is a tripwire, not a proof. The gate check is a substring test:
 * a file merely mentioning DATA_SOURCE_ (even in a comment) passes, and a file
 * that branches correctly but only on one of several Notion calls also passes.
 * It catches the "someone added a Notion call and forgot entirely" case, which
 * is how all seven Phase 3.5 gaps happened. Proving that nothing reaches Notion
 * requires the runtime blackout run (invalidate NOTION_API_KEY, exercise the
 * app) — see MIGRATION.md Phase 3.5a.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOTS = ['app', 'lib', 'scripts'];

/**
 * Files that legitimately talk to Notion with no DATA_SOURCE_ gate.
 * Add here ONLY with a reason — an entry is a promise that cutover cannot break it.
 */
const ALLOWLIST: Record<string, string> = {
  // Reconcile scripts read Notion by design — they are the migration tooling.
  'scripts/reconcile-users.ts':         'migration tooling — reads Notion to seed Supabase',
  'scripts/reconcile-tasks.ts':         'migration tooling',
  'scripts/reconcile-clients.ts':       'migration tooling',
  'scripts/reconcile-portfolio.ts':     'migration tooling',
  'scripts/reconcile-insurance.ts':     'migration tooling',
  'scripts/reconcile-assets.ts':        'migration tooling',
  'scripts/reconcile-cashflow.ts':      'migration tooling',
  'scripts/reconcile-meeting-notes.ts': 'migration tooling',
  'scripts/reconcile-forms-library.ts': 'migration tooling',
  'scripts/reconcile-ai-usage.ts':      'migration tooling',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
const gated:     string[] = [];
const allowed:   string[] = [];

for (const root of ROOTS) {
  let files: string[];
  try { files = walk(root); } catch { continue; } // root may not exist
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('new Client(')) continue;
    if (ALLOWLIST[file])                 { allowed.push(file);   continue; }
    if (src.includes('DATA_SOURCE_'))    { gated.push(file);     continue; }
    offenders.push(file);
  }
}

console.log(`\nNotion gate audit — ${gated.length} gated, ${allowed.length} allowlisted, ${offenders.length} UNGATED\n`);
if (offenders.length) {
  console.error('❌ Ungated Notion access (must branch on a DATA_SOURCE_ flag, or be allowlisted with a reason):');
  for (const f of offenders) console.error(`   ${f}`);
  console.error('\nAfter cutover these read frozen Notion (stale) or write into it (silently lost).\n');
  process.exit(1);
}
console.log('✅ every Notion-touching file is flag-gated or allowlisted\n');
