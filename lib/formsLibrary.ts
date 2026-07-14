/**
 * lib/formsLibrary.ts
 * Shared types/helpers for the Forms Library (Form Finder) feature, plus the
 * read chokepoint (Notion or Supabase per DATA_SOURCE_FORMS). Forms are a
 * company-wide shared catalogue (no advisor scoping); PDF bodies live in Google
 * Drive, this index holds only metadata + field mapping.
 *
 * NOTE: reads only. Writes (admin upload/update/delete — Drive + Notion) and the
 * cross-table prefill/fill routes stay on Notion, deferred to later phases.
 */

import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import type { AdvisorConfig } from './getAdvisorConfig';
import * as sbForms from './repos/formsLibrary';

/** Client-data keys an admin can map a PDF field to. Shared between the
 *  field-mapping tool (admin) and the auto-fill pipeline (FA-facing). */
export const CLIENT_DATA_KEYS: { key: string; label: string }[] = [
  { key: 'client.name',           label: 'Client Name' },
  { key: 'client.icNumber',       label: 'Client IC / Passport No.' },
  { key: 'client.dob',            label: 'Client Date of Birth' },
  { key: 'client.address',        label: 'Client Address' },
  { key: 'client.phone',          label: 'Client Phone' },
  { key: 'client.email',          label: 'Client Email' },
  { key: 'policy.policyNumber',   label: 'Policy Number' },
  { key: 'policy.provider',       label: 'Policy Provider' },
  { key: 'policy.planName',       label: 'Policy / Plan Name' },
  { key: 'policy.sumAssured',     label: 'Sum Assured' },
  { key: 'account.accountNumber', label: 'Investment Account Number' },
  { key: 'account.fundName',      label: 'Fund Name' },
  { key: 'advisor.name',          label: 'Advisor Name' },
  { key: '__manual',              label: '(FA fills in manually)' },
];

export const FORM_CATEGORIES = [
  'New Application',
  'Fund Switch',
  'Beneficiary Change',
  'Address Change',
  'Claim',
  'Premium Payment Change',
  'Surrender',
  'Other',
];

export interface FillableFieldMapping {
  pdfField: string;
  dataKey:  string;
}

export interface FieldMapping {
  type:   'fillable' | 'scanned';
  fields: FillableFieldMapping[];
}

export interface FormRecord {
  id:           string;
  name:         string;
  provider:     string;
  category:     string;
  tags:         string[];
  formType:     'Fillable PDF' | 'Scanned PDF' | '';
  pdfUrl:       string;
  fieldMapping: FieldMapping | null;
  active:       boolean;
}

/** Extract the Google Drive file id from a `drive.google.com/uc?id=...` URL. */
export function driveFileIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

// ── Read chokepoint (Notion ↔ Supabase) ──────────────────────────────────────

function useSupabase(): boolean {
  return process.env.DATA_SOURCE_FORMS === 'supabase';
}

function rt(props: Record<string, unknown>, key: string): string {
  const p = props[key] as { type: string; rich_text?: { plain_text: string }[] } | undefined;
  return p?.type === 'rich_text' ? (p.rich_text?.[0]?.plain_text ?? '') : '';
}

/** Map a Notion Forms Library page to a FormRecord. */
export function toFormRecord(page: PageObjectResponse): FormRecord {
  const p = page.properties as Record<string, unknown>;
  const name = (p['Name'] as { title?: { plain_text: string }[] } | undefined)?.title?.[0]?.plain_text ?? '';
  const provider = (p['Provider'] as { select?: { name: string } } | undefined)?.select?.name ?? '';
  const category = (p['Category'] as { select?: { name: string } } | undefined)?.select?.name ?? '';
  const tags = ((p['Tags'] as { multi_select?: { name: string }[] } | undefined)?.multi_select ?? []).map(t => t.name);
  const formType = (p['Form Type'] as { select?: { name: string } } | undefined)?.select?.name as FormRecord['formType'] ?? '';
  const pdfUrl = rt(p, 'PDF URL');
  const active = (p['Active'] as { checkbox?: boolean } | undefined)?.checkbox ?? false;
  const mappingRaw = rt(p, 'Field Mapping');
  let fieldMapping: FieldMapping | null = null;
  if (mappingRaw) { try { fieldMapping = JSON.parse(mappingRaw); } catch { /* ignore malformed */ } }
  return { id: page.id, name, provider, category, tags, formType, pdfUrl, fieldMapping, active };
}

/** List forms — company-wide catalogue. `activeOnly` limits to Active=true (FA view). */
export async function listForms(config: AdvisorConfig, opts?: { activeOnly?: boolean }): Promise<FormRecord[]> {
  if (useSupabase()) return sbForms.listForms(opts);
  const dbId = process.env.COMPANY_FORMS_DB_ID;
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE' || !dbId) return [];

  const notion = new Client({ auth: config.notionApiKey });
  const res = await notion.databases.query({
    database_id: dbId,
    ...(opts?.activeOnly ? { filter: { property: 'Active', checkbox: { equals: true } } } : {}),
    page_size: 100,
  });
  return res.results.filter(isFullPage).map(toFormRecord);
}

/** A single form by id (Notion page id or Supabase uuid per flag), or null. */
export async function getForm(config: AdvisorConfig, id: string): Promise<FormRecord | null> {
  if (useSupabase()) return sbForms.getForm(id);
  if (!config.notionApiKey || config.notionApiKey === 'DEMO_MODE') return null;

  const notion = new Client({ auth: config.notionApiKey });
  const page = await notion.pages.retrieve({ page_id: id });
  if (!isFullPage(page)) return null;
  return toFormRecord(page);
}
