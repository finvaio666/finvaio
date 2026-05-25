import { Client, isFullPage } from '@notionhq/client';

export interface AdvisorConfig {
  notionApiKey:       string;
  clientsDbId:        string;
  portfolioDbId:      string;
  insuranceDbId:      string;
  cashflowDbId:       string;
  meetingNotesDbId:   string;
  insurancePlansDbId: string;  // product catalogue — insurance plans FA can sell
  fundsDbId:          string;  // product catalogue — investment funds FA can sell
  role:               string;
  name:               string;
}

// In-process cache — survives warm function re-use, cleared on cold start
const cache = new Map<string, { config: AdvisorConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  if (p?.type === 'rich_text') return p.rich_text?.[0]?.plain_text ?? '';
  return '';
}

export async function getAdvisorConfig(advisorId: string): Promise<AdvisorConfig | null> {
  const cached = cache.get(advisorId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config;

  const hostKey = process.env.NOTION_API_KEY; // Bill's key — used to read the shared Users table
  if (!hostKey) return null;

  const notion = new Client({ auth: hostKey });

  try {
    const page = await notion.pages.retrieve({ page_id: advisorId });
    if (!isFullPage(page)) return null;

    const p = page.properties as Record<string, unknown>;
    const config: AdvisorConfig = {
      notionApiKey:     rt(p, 'Notion API Key'),
      clientsDbId:      rt(p, 'Clients DB ID'),
      portfolioDbId:    rt(p, 'Portfolio DB ID'),
      insuranceDbId:    rt(p, 'Insurance DB ID'),
      cashflowDbId:     rt(p, 'Cashflow DB ID'),
      meetingNotesDbId:   rt(p, 'Meeting Notes DB ID'),
      insurancePlansDbId: rt(p, 'Insurance Plans DB ID'),
      fundsDbId:          rt(p, 'Funds DB ID'),
      role: (p['Role'] as { type: string; select?: { name: string } } | undefined)?.select?.name ?? 'Advisor',
      name: (p['Name']  as { type: string; title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '',
    };

    cache.set(advisorId, { config, ts: Date.now() });
    return config;
  } catch {
    return null;
  }
}

/** Call this after a password reset so the cached config is immediately invalidated. */
export function clearAdvisorCache(advisorId: string) {
  cache.delete(advisorId);
}
