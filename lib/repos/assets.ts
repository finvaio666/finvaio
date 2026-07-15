/**
 * lib/repos/assets.ts
 * Supabase data-access layer for Assets & Liabilities (Phase 2, tables 2.4 read
 * + 2.11 write). `client` is a name string (not a notion_id relation).
 *
 * Writes: replaceAssetEntries mirrors the Notion POST (archive prior marker rows
 * for a client, then insert the fresh set) — except delete is a hard DELETE (the
 * migration's known archive→delete trade-off). update/delete carry an advisor
 * ownership guard (Admin may touch any row).
 */

import { getSupabase } from '../supabase';
import type { AdvisorConfig } from '../getAdvisorConfig';
import type { AssetItem } from '../assets';

const TABLE = 'assets_liabilities';

interface Row {
  id: string;
  notion_id: string | null;
  name: string | null;
  client: string | null;
  type: string | null;
  category: string | null;
  value_myr: number | string | null;
  notes: string | null;
  advisor: string | null;
}

function toItem(r: Row): AssetItem {
  return {
    id:          r.id,
    notionId:    r.notion_id ?? '',
    name:        r.name ?? '',
    client:      r.client ?? '',
    type:        r.type ?? '',
    category:    r.category ?? '',
    valueMyr:    r.value_myr == null ? 0 : Number(r.value_myr),
    notes:       r.notes ?? '',
    advisorName: r.advisor ?? '',
  };
}

/** List asset/liability items scoped to this advisor (Admin sees all). */
export async function listAssets(config: AdvisorConfig): Promise<AssetItem[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select('id, notion_id, name, client, type, category, value_myr, notes, advisor');
  if (config.role !== 'Admin') q = q.eq('advisor', config.name);
  const { data, error } = await q;
  if (error) throw new Error(`assets list failed: ${error.message}`);
  return (data as Row[]).map(toItem);
}

export interface AssetInsert {
  name: string; client: string; type: string; category: string; valueMyr: number; notes: string; advisor: string;
}

/**
 * Replace this advisor's marker rows for a client (net-worth form re-save):
 * hard-delete rows matching (client, advisor, notes LIKE marker), then insert
 * the fresh set. Returns the inserted count.
 */
export async function replaceAssetEntries(advisor: string, client: string, marker: string, rows: AssetInsert[]): Promise<number> {
  const sb = getSupabase();
  const { error: delErr } = await sb.from(TABLE).delete()
    .eq('client', client).eq('advisor', advisor).like('notes', `%${marker}%`);
  if (delErr) throw new Error(`assets replace delete failed: ${delErr.message}`);
  if (rows.length) {
    const { error } = await sb.from(TABLE).insert(rows.map(r => ({
      name: r.name, client: r.client, type: r.type, category: r.category,
      value_myr: r.valueMyr, notes: r.notes, advisor: r.advisor,
    })));
    if (error) throw new Error(`assets replace insert failed: ${error.message}`);
  }
  return rows.length;
}

/** Guard: non-admins may only touch their own rows. Throws 'Forbidden' otherwise. */
async function assertOwner(config: AdvisorConfig, id: string): Promise<void> {
  if (config.role === 'Admin') return;
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select('advisor').eq('id', id).maybeSingle();
  if (error) throw new Error(`assets owner lookup failed: ${error.message}`);
  if (!data || (data as { advisor: string }).advisor !== config.name) throw new Error('Forbidden');
}

/** Update a single asset row (partial patch of already-mapped columns). */
export async function updateAsset(config: AdvisorConfig, id: string, patch: Record<string, unknown>): Promise<void> {
  await assertOwner(config, id);
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(`assets update failed: ${error.message}`);
}

/** Hard-delete a single asset row (advisor-scoped). */
export async function deleteAsset(config: AdvisorConfig, id: string): Promise<void> {
  await assertOwner(config, id);
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`assets delete failed: ${error.message}`);
}
