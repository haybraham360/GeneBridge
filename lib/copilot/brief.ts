/**
 * The pre-session brief (task 16, section 2). Pure: built only from the
 * RequestDetail that pro_request_detail() returned, which already holds
 * nothing the patient didn't share (and logged each read in access_log).
 *
 * - briefInput(): the minimal JSON the model sees. A flagged result is sent
 *   as "flagged" plus the reason only: no condition, status or genotype.
 * - rulePoints(): the same brief without AI, as translation keys. Also the
 *   fallback when the model's points fail the check.
 */
import type { PersonDetail, RequestDetail, ValueQuestion } from '@/lib/pro/types';

export const TEACHBACK_QUESTIONS = 3;

export type BriefPerson = {
  name: string;
  locale: string | null;
  finding: { flagged: true; reason: string | null } | { flagged: false; result: string } | null;
  /** Of 3, once they've shared their result and it isn't flagged. */
  understood: number | null;
  questions: string[];
  sharedSummary: string | null;
};

export type BriefInput = {
  couple: boolean;
  people: BriefPerson[];
  /** Topics where both partners shared values and they differ. */
  valuesDiffer: string[];
};

export type Labels = {
  person: (p: PersonDetail) => string;
  resultLine: (p: PersonDetail) => string;
  valueTopic: (q: ValueQuestion) => string;
};

export function briefInput(detail: RequestDetail, labels: Labels): BriefInput {
  const people = detail.people.map((p, i): BriefPerson => {
    const r = p.result;
    return {
      name: labels.person(p),
      locale: p.locale,
      finding: r ? (r.flagged ? { flagged: true, reason: r.flagReason } : { flagged: false, result: labels.resultLine(p) }) : null,
      understood: r && !r.flagged ? r.understood : null,
      questions: (p.questions ?? []).slice(0, 10).map((q) => q.slice(0, 500)),
      sharedSummary: (i === 0 ? detail.requestSummary : null) ?? p.aiSummary ?? null,
    };
  });
  return {
    couple: detail.isCouple,
    people,
    valuesDiffer: detail.values.filter((v) => v.agreement === 'differ').map((v) => labels.valueTopic(v.questionId)),
  };
}

export type RulePoint =
  | { key: 'flagged'; values: { name: string } }
  | { key: 'understanding'; values: { name: string; count: number; total: number } }
  | { key: 'understandingAll'; values: { name: string } }
  | { key: 'questions'; values: { name: string; count: number } }
  | { key: 'valuesDiffer'; values: { topics: string } }
  | { key: 'sharedSummary'; values: { name: string } }
  | { key: 'nothingShared'; values: Record<string, never> };

export function rulePoints(input: BriefInput, list: (items: string[]) => string): RulePoint[] {
  const points: RulePoint[] = [];
  for (const p of input.people) {
    if (p.finding?.flagged) points.push({ key: 'flagged', values: { name: p.name } });
  }
  for (const p of input.people) {
    if (p.understood === null) continue;
    points.push(
      p.understood < TEACHBACK_QUESTIONS
        ? { key: 'understanding', values: { name: p.name, count: p.understood, total: TEACHBACK_QUESTIONS } }
        : { key: 'understandingAll', values: { name: p.name } },
    );
  }
  for (const p of input.people) {
    if (p.questions.length) points.push({ key: 'questions', values: { name: p.name, count: p.questions.length } });
  }
  if (input.valuesDiffer.length) points.push({ key: 'valuesDiffer', values: { topics: list(input.valuesDiffer) } });
  for (const p of input.people) {
    if (p.sharedSummary) points.push({ key: 'sharedSummary', values: { name: p.name } });
  }
  if (points.length === 0) points.push({ key: 'nothingShared', values: {} });
  return points;
}

/** Anything shared at all? Without it there's nothing for the model to read. */
export const hasShared = (input: BriefInput) =>
  input.valuesDiffer.length > 0 || input.people.some((p) => p.finding || p.questions.length || p.sharedSummary);
