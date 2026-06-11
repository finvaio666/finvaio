/**
 * lib/formsLibrary.ts
 * Shared types/helpers for the Forms Library (Form Finder) feature.
 */

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
