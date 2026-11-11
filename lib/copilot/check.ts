/**
 * Counsellor copilot checks (task 16). Pure: shared by the server actions
 * and the tests.
 *
 * - Brief points: any problem at all and the AI points are dropped for the
 *   rule-based ones. The brief never contains a chance or a percentage.
 * - Patient summaries: problems are shown to the counsellor, never fixed
 *   silently. Some block approval (guardrails 1–3: directive wording,
 *   marriage advice, carriers described as ill, rulings, medication); the
 *   rest need the counsellor to confirm they checked them.
 */
import { checkReply, statedChances, type CheckProblem } from '@/lib/assistant/outputCheck';

export type SummaryProblem = CheckProblem | 'carrier_not_healthy' | 'wrong_language';

export const summaryProblems: readonly SummaryProblem[] = [
  'directive',
  'marriage_advice',
  'religious_ruling',
  'medication',
  'carrier_not_healthy',
  'diagnosis',
  'unverified_number',
  'wrong_language',
];

/** Can't be approved until reworded. */
export const blockingProblems: readonly SummaryProblem[] = [
  'directive',
  'marriage_advice',
  'religious_ruling',
  'medication',
  'carrier_not_healthy',
];

export const isSummaryProblem = (p: string): p is SummaryProblem => (summaryProblems as readonly string[]).includes(p);

// Carriers described as ill (guardrail 3). Negations ("doesn't make you ill") are fine.
const enCarrierIll =
  /\bcarriers?\s+(is|are)\s+(sick|ill|affected|diseased|unhealthy|not healthy)\b|\bcarriers? (has|have) the (disease|condition)\b|\bbeing a carrier means you (are|will be|could be) (sick|ill|affected)\b/iu;
const arCarrierIll = /حامل(و|ي)?\s*الصفة\s*(مريض|مرضى|مصاب)|الحامل(ون|ين)?\s+(مرضى|مريض|مصابون)/u;

// Briefs talk about the patient, not to them: no "they should", "best", verdicts.
const briefDirective =
  /\b(should|shouldn'?t|must|ought to|had better|recommend(ed)?|advis(e|able)|best (option|choice|path)|right (choice|decision)|(not )?compatible)\b|يجب|ينبغي|عليهم أن|عليهما أن|الأفضل|أفضل خيار|ننصح|أنصح|متوافق/iu;

function arabicShare(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[؀-ۿ]/u.test(c)).length / letters.length : 0;
}

function wrongLanguage(text: string, locale: 'ar' | 'en'): boolean {
  const share = arabicShare(text);
  return locale === 'ar' ? share < 0.6 : share > 0.2;
}

/**
 * A patient summary. Chances are allowed only when the counsellor stated
 * them in their own notes: the model never adds a number.
 */
export function checkSummary(text: string, notes: string, locale: 'ar' | 'en'): SummaryProblem[] {
  const body = text.trim();
  if (!body) return [];
  const problems = new Set<SummaryProblem>(checkReply(body, statedChances(notes)).problems);
  if (enCarrierIll.test(body) || arCarrierIll.test(body)) problems.add('carrier_not_healthy');
  if (wrongLanguage(body, locale)) problems.add('wrong_language');
  return summaryProblems.filter((p) => problems.has(p));
}

export const blocking = (problems: readonly SummaryProblem[]) => problems.filter((p) => blockingProblems.includes(p));

/** Brief points for the counsellor: no problems of any kind, and no chances. */
export function briefPointsOk(points: readonly string[], locale: 'ar' | 'en'): boolean {
  if (points.length === 0 || points.length > 6) return false;
  return points.every((p) => {
    const t = p.trim();
    return (
      t.length > 0 &&
      t.length <= 400 &&
      checkReply(t, []).ok &&
      !briefDirective.test(t) &&
      statedChances(t).length === 0 &&
      !/%|٪/u.test(t) &&
      !enCarrierIll.test(t) &&
      !arCarrierIll.test(t) &&
      !wrongLanguage(t, locale)
    );
  });
}

/** "- one\n- two" → ["one", "two"]. */
export function parsePoints(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/u, '').trim())
    .filter(Boolean);
}
