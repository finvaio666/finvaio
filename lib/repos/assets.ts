/**
 * lib/repos/assets.ts
 * Supabase data-access layer for Assets & Liabilities (Phase 2, table 2.4).
 * `client` is a name string (not a notion_id relation).
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
