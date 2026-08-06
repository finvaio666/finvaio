/**
 * lib/formMatch.ts
 * Keyword pass for the deferment/requirements-letter → matched-forms feature.
 * Pure + dependency-free so it can run before (and cheaper than) the AI fallback.
 * The route calls keywordMatch first; only if confidence is low does it fall
 * back to the LLM (see app/api/forms/match/route.ts).
 */

export interface MatchForm {
  id: string;
  name: string;
  provider: string;
  category: string;
  tags: string[];
  formType: string;
}

export interface ScoredForm extends MatchForm {
  score: number;
}

// Words too generic to carry meaning in an insurer letter / form name.
const STOP = new Set([
  'form', 'forms', 'the', 'and', 'for', 'of', 'to', 'a', 'an', 'or', 'please',
  'kindly', 'your', 'you', 'we', 'our', 'this', 'that', 'with', 'from', 'is',
  'are', 'be', 'as', 'at', 'in', 'on', 'by', 'completed', 'complete', 'copy',
  'certified', 'attached', 'enclosed', 'submit', 'submission', 'provide',
  'furnish', 'required', 'requirement', 'requirements', 'policy', 'insurance',
  'insured', 'life', 'assured', 'dear', 'sir', 'madam', 'letter', 'client',
]);

/** Lowercase significant word tokens (len ≥ 3, minus stopwords). */
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length >= 3 && !STOP.has(w));
}

/**
 * Score each form against the letter text. A tag or category hit is a strong
 * signal (insurer letters echo those); name-word hits are weaker corroboration.
 * Returns only forms with score > 0, most relevant first.
 */
export function keywordMatch(letter: string, forms: MatchForm[]): ScoredForm[] {
  const hay = ` ${letter.toLowerCase()} `;
  return forms
    .map(f => {
      let score = 0;
      for (const t of f.tags) {
        const tag = t.trim().toLowerCase();
        if (tag && hay.includes(tag)) score += 3;
      }
      if (f.category && hay.includes(f.category.toLowerCase())) score += 2;
      for (const w of tokens(f.name)) {
        if (hay.includes(w)) score += 1;
      }
      return { ...f, score };
    })
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Confident when at least one form scored a tag/category-level hit (≥ 3).
 * Below that, name-word overlap alone is too noisy — defer to the AI fallback.
 */
export function isConfident(scored: ScoredForm[]): boolean {
  return scored.length > 0 && scored[0].score >= 3;
}
