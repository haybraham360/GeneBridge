/**
 * Matches a finding read from a report to the condition catalogue (task 12,
 * section 3 step 4). Deterministic first:
 *   1. gene symbol (when the gene belongs to exactly one condition, or the
 *      name settles which one);
 *   2. the name and synonym dictionary, in English and Arabic;
 *   3. fuzzy match, as a last resort. A fuzzy match is only a suggestion:
 *      the person confirms it before it counts.
 */
import { allEntries, normalise, type LibraryEntry } from '@/lib/assistant/library';

export type MatchMethod = 'gene' | 'name' | 'gene_name';

export type Match =
  | { conditionId: string; method: MatchMethod; suggestion: null }
  | { conditionId: null; method: null; suggestion: string | null };

type Indexed = { id: string; genes: string[]; terms: string[] };

let index: Indexed[] | null = null;

function terms(entry: LibraryEntry): string[] {
  return [entry.title, ...entry.aliases, ...(entry.synonyms ?? [])];
}

/** Gene symbols normalised: upper case, Latin letters and digits only. */
export function normaliseGene(gene: string): string {
  return gene.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Lower case, no diacritics, hyphens and slashes as spaces, Greek letters spelled out. */
export function normaliseName(text: string): string {
  return normalise(
    text
      .normalize('NFKC')
      .replace(/α/g, 'alpha ')
      .replace(/β/g, 'beta ')
      .replace(/[-–/_()]/g, ' '),
  );
}

function catalogue(): Indexed[] {
  if (index) return index;
  const byId = new Map<string, Indexed>();
  for (const locale of ['en', 'ar'] as const) {
    for (const entry of allEntries(locale)) {
      if (entry.kind !== 'condition') continue;
      const item = byId.get(entry.id) ?? { id: entry.id, genes: [], terms: [] };
      if (entry.gene) {
        for (const g of entry.gene.split(/[,\s/]+/)) if (g) item.genes.push(normaliseGene(g));
      }
      for (const t of terms(entry)) {
        const n = normaliseName(t);
        if (n) item.terms.push(n);
      }
      byId.set(entry.id, item);
    }
  }
  index = [...byId.values()].map((i) => ({ ...i, genes: [...new Set(i.genes)], terms: [...new Set(i.terms)] }));
  return index;
}

/** Every catalogue condition whose name or synonym appears in the text, with the longest term matched. */
function byName(text: string): { id: string; length: number }[] {
  const t = ` ${normaliseName(text)} `;
  const found: { id: string; length: number }[] = [];
  for (const item of catalogue()) {
    let best = 0;
    for (const term of item.terms) {
      // Whole words; Arabic words may carry a joined prefix (و، ف، ب، ل، ك، ال).
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\s(?:[وفبلك]{0,2}(?:ال)?)?${escaped}\\s`, 'u').test(t)) best = Math.max(best, term.length);
    }
    if (best > 0) found.push({ id: item.id, length: best });
  }
  return found.sort((a, b) => b.length - a.length);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 0 to 1: how alike two names are, by edit distance. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

const FUZZY_THRESHOLD = 0.75;

function fuzzy(text: string): string | null {
  const t = normaliseName(text);
  if (t.length < 4) return null;
  let best: { id: string; score: number } | null = null;
  for (const item of catalogue()) {
    for (const term of item.terms) {
      if (term.length < 4) continue;
      const score = similarity(t, term);
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { id: item.id, score };
    }
  }
  return best?.id ?? null;
}

export function matchCondition(finding: { condition_text: string; gene?: string | null }): Match {
  const genes = (finding.gene ?? '').split(/[,\s/;]+/).map(normaliseGene).filter(Boolean);
  const named = byName(finding.condition_text);
  const byGene = genes.length ? catalogue().filter((i) => genes.some((g) => i.genes.includes(g))) : [];

  if (byGene.length > 0) {
    // The name agrees with one of the gene's conditions: strongest match.
    const agreed = named.find((n) => byGene.some((g) => g.id === n.id));
    if (agreed) return { conditionId: agreed.id, method: 'gene_name', suggestion: null };
    // The name points somewhere else: contradictory, so only suggest.
    if (named.length > 0) return { conditionId: null, method: null, suggestion: byGene.length === 1 ? byGene[0].id : null };
    if (byGene.length === 1) return { conditionId: byGene[0].id, method: 'gene', suggestion: null };
    // One gene, several conditions (HBB: sickle cell and beta-thalassaemia).
    return { conditionId: null, method: null, suggestion: null };
  }

  if (named.length > 0) {
    // Two different conditions equally well named: let the person choose.
    if (named.length > 1 && named[0].length === named[1].length) return { conditionId: null, method: null, suggestion: named[0].id };
    return { conditionId: named[0].id, method: 'name', suggestion: null };
  }

  return { conditionId: null, method: null, suggestion: fuzzy(finding.condition_text) };
}

/** Catalogue ids a person can pick from when correcting a finding. */
export function catalogueIds(): string[] {
  return catalogue().map((i) => i.id);
}
