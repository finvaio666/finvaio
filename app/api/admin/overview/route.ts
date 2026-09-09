import { NextRequest, NextResponse } from 'next/server';
import { Client, isFullPage } from '@notionhq/client';
import { getAdvisorConfig } from '@/lib/getAdvisorConfig';
import { listClients } from '@/lib/clients';
import { listHoldings, holdingValueMyr, holdingValueOriginal, isExitedHolding, type PortfolioHolding } from '@/lib/portfolio';
import { getPlatformGroups, derivePlatform } from '@/lib/platformGroups';
import * as sbUsers from '@/lib/repos/users';

const useSupabaseUsers = () => process.env.DATA_SOURCE_USERS === 'supabase';

export const dynamic = 'force-dynamic';

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

export interface FAStats {
  id:              string;
  name:            string;
  username:        string;
  active:          boolean;
  clientCount:     number;
  investedClients: number;  // clients actually holding something — the rest are prospects/dormant
  holdingCount:    number;
  totalAUM:        number;
  needsAction:     number;  // notes flagged KI/KO awaiting admin confirmation
  hasGmail:        boolean;
  lastActivity:    string;  // ISO date or ''
}

export interface Slice { name: string; value: number }

/** A note flagged KI or likely-KO/matured, surfaced so an admin can act on it. */
export interface AttentionNote {
  id:            string;
  productName:   string;   // ISIN — what groups this row with its sibling copies below
  name:          string;
  advisor:       string;
  clientName:    string;
  flag:          'ki' | 'likely-ko' | 'likely-matured';
  currency:      string;   // the note's own denomination — USD, SGD, MYR…
  valueOriginal: number;   // in `currency`, not converted
  valueMyr:      number;   // MYR equivalent — kept for sorting/ranking across currencies, not for display
}

/**
 * One flagged note, aggregated across every client/FA holding a copy of it.
 * A shared structured note is one row per client in portfolio_holdings, but
 * KO/KI/maturity is a fact about the NOTE, not about any one client's slice
 * of it — confirming CRWD/ZS/NET knocked out means it knocked out for every
 * client who held it, not just the first row an admin happens to click.
 * `rows` is what a single "Confirm exit" click on this group has to update.
 */
export interface AttentionGroup {
  productName:  string;
  name:         string;
  flag:         'ki' | 'likely-ko' | 'likely-matured';
  currency:     string;         // one ISIN is always one currency, so this is set once per group
  totalValueOriginal: number;   // sum in `currency` — what the page actually displays
  totalValueMyr: number;        // MYR equivalent — sort key only; groups span different currencies so this is the one comparable total
  advisors:     string[];   // distinct FAs affected, for the "who does this touch" summary
  rows:         { id: string; clientName: string; advisor: string; currency: string; valueOriginal: number; valueMyr: number }[];
}

export interface AdminOverview {
  totalFAs:        number;
  activeFAs:       number;
  totalClients:    number;
  investedClients: number;
  totalHoldings:   number;
  totalAUM:        number;
  byAssetClass:    Slice[];
  byPlatformGroup: Slice[];
  advisors:        FAStats[];
  attention:       AttentionNote[];
  attentionGroups: AttentionGroup[];
}

/** One full UTC day after `dateStr` — mirrors PortfolioPage's flag threshold. */
function daysAfterUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Same derivation the Investment page shows per note (see deriveNoteFlag in
 * PortfolioPage) — a hint only, never written back; an admin still confirms.
 * Duplicated rather than shared because that copy lives in a client component.
 */
function deriveNoteFlag(h: PortfolioHolding): AttentionNote['flag'] | null {
  const d = h.underlyingDetails;
  if (h.assetClass !== 'Structured Product' || !d?.schedule?.length) return null;
  const todayUTC = new Date().toISOString().slice(0, 10);
  const finalRow = d.schedule.find(s => s.label.startsWith('Final'));
  if (finalRow && todayUTC >= daysAfterUTC(finalRow.date, 1)) return 'likely-matured';
  if (d.schedule.some(s => s.label.startsWith('KO obs') && s.resolved && s.cleared)) return 'likely-ko';
  if (d.underlyings.some(u => typeof u.today === 'number' && u.today < u.ki)) return 'ki';
  return null;
}

export async function GET(req: NextRequest) {
  const advisorId = req.headers.get('x-advisor-id') ?? '';
  if (!advisorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAdvisorConfig(advisorId);
  if (config?.role !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  type FaUser = { id: string; name: string; username: string; active: boolean; hasGmail: boolean };
  let faUsers: FaUser[];

  if (useSupabaseUsers()) {
    faUsers = (await sbUsers.listUsers())
      .filter(u => (u.role || 'Advisor') === 'Advisor') // only FAs, not admins
      .map(u => ({ id: u.id, name: u.name, username: u.username, active: u.active, hasGmail: u.hasGmail }));
  } else {
    const hostKey   = process.env.NOTION_API_KEY;
    const usersDbId = process.env.NOTION_USERS_DB_ID;
    if (!hostKey || !usersDbId) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const notion = new Client({ auth: hostKey });
    const usersRes = await notion.databases.query({ database_id: usersDbId, page_size: 50 });
    faUsers = usersRes.results.filter(isFullPage).filter(page => {
      const p    = page.properties as Record<string, unknown>;
      const role = (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor';
      return role === 'Advisor'; // only FAs, not admins
    }).map(page => {
      const p = page.properties as Record<string, unknown>;
      return {
        id:       page.id,
        name:     (p['Name'] as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '',
        username: rt(p, 'Username'),
        active:   (p['Active'] as { type: string; checkbox?: boolean } | undefined)?.checkbox ?? true,
        hasGmail: !!rt(p, 'Gmail Refresh Token'),
      };
    });
  }

  // AUM comes from the actual holdings, NOT the clients.aum_myr column: that
  // field is a denormalized snapshot only some records ever had written, so
  // summing it under-reported company AUM by ~5x (RM 10.7M against a real
  // RM 64.8M on 2026-08-29). Holdings are the same rows the Investment page
  // totals, through the same holdingValueMyr rule, so the two agree by
  // construction. `config` is Admin here, so listHoldings/listClients are
  // unscoped — the whole company.
  const [clients, allHoldings, platformGroups] = await Promise.all([
    listClients(config),
    listHoldings(config),
    getPlatformGroups(),
  ]);

  const holdings = allHoldings.filter(h => !isExitedHolding(h));
  const clientNameById = new Map(clients.map(c => [c.notionId, c.name]));

  // Client counts stay sourced from the client records (an FA's book includes
  // people who hold nothing yet); investedClients is the subset with holdings.
  const byAdvisor = new Map<string, {
    count: number; invested: Set<string>; holdings: number;
    aum: number; needsAction: number; lastActivity: string;
  }>();
  const agg = (name: string) => {
    let a = byAdvisor.get(name);
    if (!a) { a = { count: 0, invested: new Set(), holdings: 0, aum: 0, needsAction: 0, lastActivity: '' }; byAdvisor.set(name, a); }
    return a;
  };
  for (const c of clients) {
    if (!c.advisorName) continue;
    const a = agg(c.advisorName);
    a.count += 1;
    if (c.lastEdited && c.lastEdited > a.lastActivity) a.lastActivity = c.lastEdited;
  }

  const assetTotals = new Map<string, number>();
  const groupTotals = new Map<string, number>();
  const attention: AttentionNote[] = [];
  let totalAUM = 0;

  for (const h of holdings) {
    const v = holdingValueMyr(h);
    totalAUM += v;

    const cls = h.assetClass || 'Unclassified';
    assetTotals.set(cls, (assetTotals.get(cls) ?? 0) + v);

    const platform = h.platform || derivePlatform(h.institution, h.fameAccountNo);
    const group = platformGroups.find(g => g.platforms.some(p => p.toLowerCase() === platform.toLowerCase()));
    const gName = group?.name ?? 'Ungrouped';
    groupTotals.set(gName, (groupTotals.get(gName) ?? 0) + v);

    const flag = deriveNoteFlag(h);
    if (h.advisorName) {
      const a = agg(h.advisorName);
      a.holdings += 1;
      a.aum += v;
      if (h.clientNotionId) a.invested.add(h.clientNotionId);
      if (flag) a.needsAction += 1;
    }
    if (flag) {
      attention.push({
        id: h.id, productName: h.productName, name: h.name, advisor: h.advisorName,
        clientName: clientNameById.get(h.clientNotionId) ?? '', flag,
        currency: h.currency || 'MYR', valueOriginal: holdingValueOriginal(h), valueMyr: v,
      });
    }
  }

  const advisors: FAStats[] = faUsers.map((u) => {
    const a = byAdvisor.get(u.name);
    return {
      id:              u.id,
      name:            u.name || u.username,
      username:        u.username,
      active:          u.active,
      clientCount:     a?.count ?? 0,
      investedClients: a?.invested.size ?? 0,
      holdingCount:    a?.holdings ?? 0,
      totalAUM:        a?.aum ?? 0,
      needsAction:     a?.needsAction ?? 0,
      hasGmail:        u.hasGmail,
      lastActivity:    a?.lastActivity ?? '',
    };
  }).sort((x, y) => y.totalAUM - x.totalAUM);   // biggest book first — the ranking is the point

  const bySize = (m: Map<string, number>): Slice[] =>
    [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Group flagged rows by ISIN — a shared note is one row per client, but the
  // KO/KI/maturity fact is about the note, so every client holding it needs
  // to show up together, not as separate unrelated-looking line items.
  // Falls back to grouping by holding id for the (should-not-happen) case of
  // a flagged row with no ISIN, so it still surfaces rather than vanishing.
  const groupMap = new Map<string, AttentionGroup>();
  for (const n of attention) {
    const key = n.productName || `__${n.id}`;
    let g = groupMap.get(key);
    if (!g) { g = { productName: n.productName, name: n.name, flag: n.flag, currency: n.currency, totalValueOriginal: 0, totalValueMyr: 0, advisors: [], rows: [] }; groupMap.set(key, g); }
    g.totalValueOriginal += n.valueOriginal;
    g.totalValueMyr += n.valueMyr;
    if (n.advisor && !g.advisors.includes(n.advisor)) g.advisors.push(n.advisor);
    g.rows.push({ id: n.id, clientName: n.clientName, advisor: n.advisor, currency: n.currency, valueOriginal: n.valueOriginal, valueMyr: n.valueMyr });
  }
  const attentionGroups = [...groupMap.values()].sort((a, b) => b.totalValueMyr - a.totalValueMyr);

  return NextResponse.json({
    totalFAs:        advisors.length,
    activeFAs:       advisors.filter(a => a.active).length,
    totalClients:    clients.length,
    investedClients: new Set(holdings.map(h => h.clientNotionId).filter(Boolean)).size,
    totalHoldings:   holdings.length,
    totalAUM,
    byAssetClass:    bySize(assetTotals),
    byPlatformGroup: bySize(groupTotals),
    advisors,
    attention:       attention.sort((a, b) => b.valueMyr - a.valueMyr),
    attentionGroups,
  } as AdminOverview);
}
