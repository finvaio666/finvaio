/**
 * lib/networthForm.ts
 * Shared schema for the client-facing Net Worth form. Each line item maps to a
 * row in the Assets & Liabilities Notion DB (Name = label, Category = grouping).
 * Pure data — safe to import from both the public form page and the submit API.
 */

export type NWType = 'Asset' | 'Liability';

export interface NWItem {
  key:      string;   // form field key
  label:    string;   // shown to client; stored as Notion "Name"
  type:     NWType;
  category: string;    // Notion "Category" select
}

export const NW_ITEMS: NWItem[] = [
  // ── Assets ──────────────────────────────────────────────────────────────
  { key: 'savingAccounts',   label: 'Saving Accounts',                          type: 'Asset', category: 'Cash & Deposits' },
  { key: 'fixedDeposits',    label: 'Fixed Deposits',                           type: 'Asset', category: 'Cash & Deposits' },
  { key: 'currentAccount',   label: 'Current Account',                          type: 'Asset', category: 'Cash & Deposits' },
  { key: 'securities',       label: 'Securities (stocks / bonds / mutual funds)', type: 'Asset', category: 'Other Investment' },
  { key: 'lifeInsuranceCsv', label: 'Life Insurance (cash surrender value)',    type: 'Asset', category: 'Other Asset' },
  { key: 'personalProperty', label: 'Personal Property (autos, jewellery, etc.)', type: 'Asset', category: 'Other Asset' },
  { key: 'retirementFunds',  label: 'Retirement Funds (EPF, PRS)',              type: 'Asset', category: 'EPF / Retirement' },
  { key: 'propertyOwnStay',  label: 'Property (Own Stay)',                       type: 'Asset', category: 'Property' },
  { key: 'propertyInvest',   label: 'Investment Property',                       type: 'Asset', category: 'Property' },
  { key: 'businessEquity',   label: 'Business / Company Equity',                 type: 'Asset', category: 'Business' },
  { key: 'otherAsset',       label: 'Other Assets',                             type: 'Asset', category: 'Other Asset' },

  // ── Liabilities ─────────────────────────────────────────────────────────
  { key: 'currentDebt',      label: 'Current Debt (Credit cards, Overdraft)',   type: 'Liability', category: 'Credit Card' },
  { key: 'hirePurchase',     label: 'Hire Purchase / Automobile Loan',          type: 'Liability', category: 'Car Loan' },
  { key: 'personalLoan',     label: 'Personal Loan',                            type: 'Liability', category: 'Personal Loan' },
  { key: 'studyLoan',        label: 'Study / Education Loan (PTPTN etc.)',       type: 'Liability', category: 'Study Loan' },
  { key: 'taxesPayable',     label: 'Taxes Payable',                            type: 'Liability', category: 'Other Liability' },
  { key: 'mortgageHome',     label: 'Property Mortgage (Home)',                 type: 'Liability', category: 'Mortgage' },
  { key: 'mortgageInvest',   label: 'Property Mortgage (Investment)',           type: 'Liability', category: 'Mortgage' },
  { key: 'otherLiability',   label: 'Other Liabilities',                        type: 'Liability', category: 'Other Liability' },
];

export const NW_ASSETS = NW_ITEMS.filter(i => i.type === 'Asset');
export const NW_LIABILITIES = NW_ITEMS.filter(i => i.type === 'Liability');
