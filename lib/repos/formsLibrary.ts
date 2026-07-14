/**
 * lib/repos/formsLibrary.ts
 * Supabase data-access layer for the Forms Library (Phase 2, table 2.9).
 * Company-wide shared catalogue (no advisor scoping). Currently empty — the
 * feature is configured but no forms have been uploaded yet. PDF bodies live in
 * Google Drive; this table holds only the metadata/index (pdf_url + mapping).
 */

import { getSupabase } from '../supabase';
import type { FieldMapping, FormRecord } from '../formsLibrary';

const TABLE = 'forms_library';
const SELECT = 'id, name, provider, category, form_type, pdf_url, field_mapping, tags, active';

interface Row {
  id:            string;
  name:          string | null;
  provider:      string | null;
  category:      string | null;
  form_type:     string | null;
  pdf_url:       string | null;
  field_mapping: string | null;
  tags:          string[] | null;
  active:        boolean | null;
}

function toRecord(r: Row): FormRecord {
  let fieldMapping: FieldMapping | null = null;
  if (r.field_mapping) { try { fieldMapping = JSON.parse(r.field_mapping); } catch { /* ignore malformed */ } }
  return {
    id:           r.id,
    name:         r.name ?? '',
    provider:     r.provider ?? '',
    category:     r.category ?? '',
    tags:         r.tags ?? [],
    formType:     (r.form_type ?? '') as FormRecord['formType'],
    pdfUrl:       r.pdf_url ?? '',
    fieldMapping,
    active:       r.active ?? false,
  };
}

/** List forms (company-wide). `activeOnly` mirrors the FA-facing Active filter. */
export async function listForms(opts?: { activeOnly?: boolean }): Promise<FormRecord[]> {
  const sb = getSupabase();
  let q = sb.from(TABLE).select(SELECT);
  if (opts?.activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`forms_library list failed: ${error.message}`);
  return (data as Row[]).map(toRecord);
}

/** A single form by id, or null if it doesn't exist. */
export async function getForm(id: string): Promise<FormRecord | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`forms_library get failed: ${error.message}`);
  return data ? toRecord(data as Row) : null;
}
