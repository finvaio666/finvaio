/**
 * lib/assets.ts
 * Chokepoint for reading Assets & Liabilities / net-worth items (Phase 2, table 2.4).
 *
 * Data-source switch. When DATA_SOURCE_ASSETS === 'supabase', items are served
 * from Supabase ONLY (straight cutover); otherwise the Notion path is used.
 *
 * NOTE: `client` here is a NAME STRING (Notion 'Client' rich_text), not a
 * notion_id relation — this table references clients by name (like tasks).
 */

import { Client, isFullPage } from '@notionhq/client';
import { AdvisorConfig } from './getAdvisorConfig';
import * as sbAssets from './repos/assets';

export interface AssetItem {
  id:          string;
  notionId:    string;
  name:        string;
  client:      string;   // client NAME string
  type:        string;   // 'Asset' | 'Liability'
  category:    string;
  valueMyr:    number;
  notes:       string;
  advisorName: string;
}

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_ASSETS === 'supabase';
}

function rt(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return v?.type === 'rich_text' ? (v.rich_text?.[0]?.plain_text ?? '') : '';
}
function num(p: Record<string, unknown>, k: string): number {
  const v = p[k] as { type: string; number?: number | null } | undefined;
  return v?.type === 'number' ? (v.number ?? 0) : 0;
}
function sel(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; select?: { name: string } } | undefined;
  return v?.type === 'select' ? (v.select?.name ?? '') : '';
}
function titleOf(p: Record<string, unknown>, k: string): string {
  const v = p[k] as { type: string; title?: { plain_text: string }[] } | undefined;
  return v?.type === 'title' ? (v.title?.[0]?.plain_text ?? '') : '';
}

/** List asset/liability items scoped to this advisor (Admin sees all). */
export async function listAssets(config: AdvisorConfig): Promise<AssetItem[]> {
  if (useSupabase()) return sbAssets.listAssets(config);
  if (!config.assetsDbId || !config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return [];

  const notion = new Client({ auth: config.notionApiKey });
  const filter = config.role !== 'Admin'
    ? { property: 'Advisor', select: { equals: config.name } }
    : undefined;

  const out: AssetItem[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: config.assetsDbId,
      page_size: 100,
      start_cursor: cursor,
      ...(filter ? { filter } : {}),
    });
    for (const cp of res.results) {
      if (!isFullPage(cp)) continue;
      const p = cp.properties as Record<string, unknown>;
      out.push({
        id:          cp.id,
        notionId:    cp.id.replace(/-/g, ''),
        name:        titleOf(p, 'Name'),
        client:      rt(p, 'Client'),
        type:        sel(p, 'Type'),
        category:    sel(p, 'Category'),
        valueMyr:    num(p, 'Value (MYR)'),
        notes:       rt(p, 'Notes'),
        advisorName: sel(p, 'Advisor'),
      });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}
