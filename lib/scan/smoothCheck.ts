/**
 * The output check for smoothed explanation wording (task 12, section 3
 * step 7). The model may only reword catalogue text. A rewrite is rejected,
 * and the catalogue wording kept, if it:
 * - fails the task 06 reply check (directive words, diagnosis or marriage
 *   language, rulings, dosing, or numbers the engine didn't give);
 * - contains any number, gene symbol or condition name that isn't in the
 *   original;
 * - adds too many new words, or changes the length a lot (new facts);
 * - changes the number of sentences (captions read one sentence at a time).
 */
import { checkReply } from '@/lib/assistant/outputCheck';
import { normaliseName, matchCondition } from './match';

export type SmoothProblem =
  | 'reply_check'
  | 'new_number'
  | 'new_gene'
  | 'new_condition'
  | 'new_words'
  | 'length'
  | 'sentence_count';

const arabicDigits = /[٠-٩]/g;
function westernDigits(text: string): string {
  return text.replace(arabicDigits, (d) => String(d.charCodeAt(0) - 0x0660));
}

function numbers(text: string): Set<string> {
  return new Set(westernDigits(text).match(/\d+(?:[.,]\d+)?/g) ?? []);
}

/** Gene-like symbols: upper-case Latin letters and digits, 3+ characters (HBB, SMN1, CFTR). */
function genes(text: string): Set<string> {
  return new Set(text.match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? []);
}

function words(text: string): string[] {
  return normaliseName(text)
    .split(' ')
    .filter((w) => w.length >= 4);
}

const MAX_NEW_WORDS = 0.4;

export function checkSmoothed(original: string[], smoothed: string[]): { ok: boolean; problems: SmoothProblem[] } {
  const problems = new Set<SmoothProblem>();
  if (original.length !== smoothed.length) problems.add('sentence_count');

  const source = original.join(' ');
  const output = smoothed.join(' ');

  const allowed = [...numbers(source)].map(Number);
  if (!checkReply(output, allowed).ok) problems.add('reply_check');

  const sourceNumbers = numbers(source);
  for (const n of numbers(output)) if (!sourceNumbers.has(n)) problems.add('new_number');

  const sourceGenes = genes(source);
  for (const g of genes(output)) if (!sourceGenes.has(g)) problems.add('new_gene');

  // Any condition named in a sentence must be named somewhere in the original.
  const named = new Set(original.map((s) => matchCondition({ condition_text: s }).conditionId).filter(Boolean));
  for (const s of smoothed) {
    const id = matchCondition({ condition_text: s }).conditionId;
    if (id && !named.has(id)) problems.add('new_condition');
  }

  const sourceWords = new Set(words(source));
  const outputWords = words(output);
  const fresh = outputWords.filter((w) => !sourceWords.has(w)).length;
  if (outputWords.length > 0 && fresh / outputWords.length > MAX_NEW_WORDS) problems.add('new_words');

  const ratio = output.length / Math.max(1, source.length);
  if (ratio < 0.6 || ratio > 1.4) problems.add('length');

  return { ok: problems.size === 0, problems: [...problems] };
}
