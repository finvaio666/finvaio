import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse, QueryDatabaseParameters } from '@notionhq/client/build/src/api-endpoints';

// Notion caps databases.query at 100 results per call. Every list endpoint
// must page through the cursor or records silently disappear once a DB
// grows past 100 rows.
export async function queryAllPages(notion: Client, args: QueryDatabaseParameters): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({ ...args, page_size: 100, start_cursor: cursor });
    pages.push(...res.results.filter(isFullPage));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return pages;
}
