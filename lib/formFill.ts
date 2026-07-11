/**
 * lib/formFill.ts
 * Resolves a form's mapped client-data keys into concrete values for the
 * FA-facing Fill & Download flow. Pulls from the same client/portfolio/insurance
 * bundle that /api/reports/client returns, plus the FA's own name.
 */

import { FieldMapping } from './formsLibrary';

export interface FillClient {
  name?: string; dob?: string; phone?: string; email?: string;
  // Not currently in the Clients DB schema — resolve blank (FA fills manually):
  icNumber?: string; address?: string;
}
export interface FillPolicy {
  id: string; policyName?: string; insurer?: string; policyNumber?: string; sumAssured?: number;
}
export interface FillAccount {
  id: string; name?: string; accountNumber?: string;
}
export interface FillBundle {
  client: FillClient;
  insurance: FillPolicy[];
  portfolio: FillAccount[];
  advisorName: string;
}

/** Pick the selected policy/account, or the only one if the client has just one. */
function pickOne<T extends { id: string }>(items: T[], id?: string): T | undefined {
  if (id) return items.find(i => i.id === id);
  return items.length === 1 ? items[0] : undefined;
}

/** Resolve a single client-data key to a display string. Unknown/missing → ''. */
export function resolveDataKey(
  key: string,
  bundle: FillBundle,
  policyId?: string,
  accountId?: string,
): string {
  const c = bundle.client;
  const policy = pickOne(bundle.insurance, policyId);
  const account = pickOne(bundle.portfolio, accountId);
  switch (key) {
    case 'client.name':           return c.name ?? '';
    case 'client.icNumber':       return c.icNumber ?? '';
    case 'client.dob':            return c.dob ?? '';
    case 'client.address':        return c.address ?? '';
    case 'client.phone':          return c.phone ?? '';
    case 'client.email':          return c.email ?? '';
    case 'policy.policyNumber':   return policy?.policyNumber ?? '';
    case 'policy.provider':       return policy?.insurer ?? '';
    case 'policy.planName':       return policy?.policyName ?? '';
    case 'policy.sumAssured':     return policy?.sumAssured != null ? String(policy.sumAssured) : '';
    case 'account.accountNumber': return account?.accountNumber ?? '';
    case 'account.fundName':      return account?.name ?? '';
    case 'advisor.name':          return bundle.advisorName ?? '';
    case '__manual':              return '';
    default:                      return '';
  }
}

/**
 * Build a { pdfField: value } map for a fillable form's mapping, resolving each
 * field's dataKey against the client bundle. `__manual` fields come back empty.
 */
export function resolvePrefill(
  mapping: FieldMapping | null,
  bundle: FillBundle,
  policyId?: string,
  accountId?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!mapping || mapping.type !== 'fillable') return out;
  for (const f of mapping.fields) {
    out[f.pdfField] = resolveDataKey(f.dataKey, bundle, policyId, accountId);
  }
  return out;
}
