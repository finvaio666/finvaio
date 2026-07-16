/**
 * lib/repos/formsLibrary.ts
 * Supabase data-access layer for the Forms Library (Phase 2, tables 2.9 read +
 * 2.11 write). Company-wide shared catalogue (no advisor scoping). Currently
 * empty — the feature is configured but no forms have been uploaded yet. PDF
 * bodies live in Google Drive; this table holds only the metadata/index
 * (pdf_url + field_mapping). Writes (createForm/updateForm/deleteForm) persist
 * that metadata; the Drive upload/download stays in the route.
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

const today = () => new Date().toISOString().slice(0, 10);

export interface FormInsert {
  name: string; provider: string; category: string; formType: string;
  pdfUrl: string; fieldMapping: FieldMapping | null; tags: string[]; active: boolean;
}

/** Insert one form metadata record (company-wide). field_mapping stored as a JSON string. */
export async function createForm(f: FormInsert): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).insert({
    name:          f.name,
    provider:      f.provider,
    category:      f.category || null,
    form_type:     f.formType,
    pdf_url:       f.pdfUrl,
    field_mapping: f.fieldMapping ? JSON.stringify(f.fieldMapping) : null,
    tags:          f.tags,
    active:        f.active,
    last_updated:  today(),
  }).select('id').single();
  if (error) throw new Error(`forms_library insert failed: ${error.message}`);
  return { id: (data as { id: string }).id };
}

/** Update field mapping / active flag (Admin edit); always bumps last_updated. */
export async function updateForm(id: string, patch: { fieldMapping?: FieldMapping; active?: boolean }): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = { last_updated: today() };
  if (patch.fieldMapping !== undefined) row.field_mapping = JSON.stringify(patch.fieldMapping);
  if (patch.active       !== undefined) row.active        = patch.active;
  const { error } = await sb.from(TABLE).update(row).eq('id', id);
  if (error) throw new Error(`forms_library update failed: ${error.message}`);
}

/** Hard-delete one form metadata record. */
export async function deleteForm(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`forms_library delete failed: ${error.message}`);
}
