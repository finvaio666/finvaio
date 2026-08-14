/**
 * lib/fieldAutoMap.ts
 * Suggests a CLIENT_DATA_KEYS mapping for an AcroForm field name, so a newly
 * imported fillable PDF (e.g. Acrobat "Prepare Form" output) doesn't need every
 * field hand-mapped from '__manual'. Deliberately conservative: only maps a
 * field when the name is unambiguous; anything about a second/joint party, or
 * with no corresponding client-data key (bank details, free-text remarks,
 * checkboxes, signatures), is left '__manual' for a human to confirm.
 *
 * Order matters — more specific patterns must come before generic ones.
 */

export interface AutoMapRule {
  test: RegExp;
  dataKey: string;
}

/** pdf-lib field constructor names that hold a literal text value we can fill.
 *  CheckBox/RadioGroup/Signature fields are selections/marks, never client data. */
const TEXT_FIELD_TYPES = new Set(['PDFTextField', 'PDFDropdown']);

export const AUTO_MAP_RULES: AutoMapRule[] = [
  // ── Never guess: second party, employer, or a "declare old vs new" pair ──────
  { test: /joint|co.?applicant|nominee|beneficiar|witness|\bagent\b/i, dataKey: '__manual' },
  { test: /employer|majikan/i, dataKey: '__manual' },
  { test: /\bprevious\b|\bnew\s*passport\b|\bold\b/i, dataKey: '__manual' },

  // ── Identity ───────────────────────────────────────────────────────────────
  { test: /nric.*passport.*(company|registration)|passport.*company.*reg/i, dataKey: 'client.icNumber' },
  { test: /\bnric\b|\bic\s*no\b|\bkp\b|passport\s*no/i, dataKey: 'client.icNumber' },
  { test: /date\s*of\s*birth|\bdob\b|\btarikh\s*lahir/i, dataKey: 'client.dob' },
  { test: /main\s*applicant.*name|applicant.*name|policy\s*holder|policy\s*owner|life\s*assured\s*name|^name\b/i, dataKey: 'client.name' },

  // ── Contact ────────────────────────────────────────────────────────────────
  { test: /email/i, dataKey: 'client.email' },
  { test: /mobile|hand\s*phone|h\/?p\b/i, dataKey: 'client.phone' },
  { test: /home\s*tel|office\s*tel|\btel\b|phone/i, dataKey: 'client.phone' },
  { test: /mailing\s*address|residential\s*address|^address\b|alamat/i, dataKey: 'client.address' },

  // ── Policy / account ───────────────────────────────────────────────────────
  { test: /policy\s*(no|number)|no\.?\s*polisi/i, dataKey: 'policy.policyNumber' },
  { test: /sum\s*assured/i, dataKey: 'policy.sumAssured' },
  { test: /plan\s*name|product\s*name/i, dataKey: 'policy.planName' },
  { test: /account\s*(no|number)/i, dataKey: 'account.accountNumber' },
  { test: /fund\s*name/i, dataKey: 'account.fundName' },

  // ── Advisor ────────────────────────────────────────────────────────────────
  { test: /agent\s*(code|name)|adviser|advisor/i, dataKey: 'advisor.name' },
];

/** Suggest a data key for one AcroForm field name; '__manual' if unmapped/ambiguous. */
export function suggestDataKey(fieldName: string): string {
  for (const rule of AUTO_MAP_RULES) {
    if (rule.test.test(fieldName)) return rule.dataKey;
  }
  return '__manual';
}

export interface PdfFieldInfo {
  name: string;
  /** pdf-lib field constructor name, e.g. 'PDFTextField', 'PDFCheckBox'. */
  type: string;
}

/**
 * Apply suggestDataKey across a form's fields, with two safety rules a
 * name-only match can't apply on its own:
 *  - only TextField/Dropdown fields ever get a data key (checkboxes/radio/
 *    signature fields are marks, not values — always '__manual');
 *  - each data key is only assigned to the FIRST matching field; a repeat
 *    match usually means "same field for a second person" and is left
 *    '__manual' rather than silently overwritten with the wrong party's data.
 */
export function autoMapFields(fields: PdfFieldInfo[]): { pdfField: string; dataKey: string }[] {
  const used = new Set<string>();
  return fields.map(({ name, type }) => {
    if (!TEXT_FIELD_TYPES.has(type)) return { pdfField: name, dataKey: '__manual' };
    const suggested = suggestDataKey(name);
    if (suggested === '__manual' || used.has(suggested)) return { pdfField: name, dataKey: '__manual' };
    used.add(suggested);
    return { pdfField: name, dataKey: suggested };
  });
}
