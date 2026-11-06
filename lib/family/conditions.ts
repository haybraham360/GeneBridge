/**
 * Matches the words someone used for a relative's condition to the
 * condition catalogue (task 13, section 2). Our code does this, never the
 * model:
 *   - a catalogue name, alias or synonym (English or Arabic) is a match;
 *   - an everyday description or a near spelling is only a suggestion
 *     ("Do you mean beta-thalassaemia?") that the person confirms;
 *   - anything else stays "Other: <their words>".
 * Variant details from a relative's test report are stripped first: the
 * family map keeps only the condition and the status.
 */
import { allEntries, normalise } from '@/lib/assistant/library';
import { matchCondition, normaliseName } from '@/lib/scan/match';
import type { ConditionStatus } from './types';

export type FamilyMatch = {
  conditionId: string | null;
  /** Up to 3 catalogue ids to ask about when there is no match. */
  candidates: string[];
  /** The person's words, cleaned of variant details. */
  words: string;
};

const VARIANT_PATTERNS: RegExp[] = [
  /\b[cgmnpr]\.\s?[\w*>_+-]*\d[\w*>_+-]*/giu, // HGVS: c.20A>T, p.Glu6Val, p.(Gln39*)
  /\bIVS[\s-]?\d+[\w\s+>-]*/giu,
  /\brs\d{3,}\b/giu,
  /\b(?:NM|NC|NG|ENST)_?\d+(?:\.\d+)?\b/giu,
  /\b(?:heterozygous|homozygous|compound heterozygous|hemizygous|pathogenic|likely pathogenic|variant|mutation|zygosity)\b/giu,
  /(?:متغير|طفرة|متماثل|متخالف)\S*/gu,
];

export function stripVariantDetails(text: string): string {
  let out = text;
  for (const re of VARIANT_PATTERNS) out = out.replace(re, ' ');
  return out.replace(/[()[\]:;,]+\s*(?=[()[\]:;,]|$)/g, ' ').replace(/\s+/g, ' ').trim();
}

const HEDGES =
  /\b(not sure|unsure|maybe|might|i think|i believe|possibly|probably|perhaps|don't know|do not know)\b|مش متأكد|مو متأكد|غير متأكد|لست متأكد|يمكن|ربما|أظن|اظن|أعتقد|اعتقد|احتمال/iu;

/** "maybe / I think / not sure" in the person's words always means not sure. */
export function hedgedStatus(words: string, status: ConditionStatus): ConditionStatus {
  return HEDGES.test(words) ? 'not_sure' : status;
}

type Everyday = { id: string; terms: string[] };
let everyday: Everyday[] | null = null;

function everydayIndex(): Everyday[] {
  if (everyday) return everyday;
  const byId = new Map<string, Set<string>>();
  for (const locale of ['en', 'ar'] as const) {
    for (const entry of allEntries(locale)) {
      if (entry.kind !== 'condition' || !entry.everyday_terms) continue;
      const set = byId.get(entry.id) ?? new Set<string>();
      for (const t of entry.everyday_terms) set.add(normalise(normaliseName(t)));
      byId.set(entry.id, set);
    }
  }
  everyday = [...byId].map(([id, set]) => ({ id, terms: [...set].filter(Boolean) }));
  return everyday;
}

export function matchFamilyCondition(query: string): FamilyMatch {
  const words = stripVariantDetails(query).slice(0, 120);
  const match = matchCondition({ condition_text: words });
  if (match.conditionId) return { conditionId: match.conditionId, candidates: [], words };

  const text = ` ${normalise(normaliseName(words))} `;
  const candidates: string[] = [];
  if (match.suggestion) candidates.push(match.suggestion);
  for (const { id, terms } of everydayIndex()) {
    if (candidates.includes(id)) continue;
    if (terms.some((t) => text.includes(` ${t} `) || text.includes(` ${t}`))) candidates.push(id);
  }
  return { conditionId: null, candidates: candidates.slice(0, 3), words };
}
