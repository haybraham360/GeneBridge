/**
 * Checks a rewritten message before the person sees it (task 09, drafting
 * mode). A rewrite that fails falls back to the guide's fixed wording.
 * Pure: shared by the draft route and the eval.
 */
import { checkReply } from '@/lib/assistant/outputCheck';

export const MAX_DRAFT_WORDS = 80;

export type DraftProblem = 'pressure' | 'carrier_not_healthy' | 'too_long' | 'wrong_language' | 'new_numbers' | 'unsafe';

// Pressure, guilt, blame and ultimatums. "You don't have to…" is fine.
const enPressure =
  /\b(you|u)\s+(must|have to|need to|should|ought to|had better)\b|\bif you (don'?t|do not|won'?t|refuse)\b|\bor else\b|\b(your|it'?s your) fault\b|\bblame\b|\bguilt(y)?\b|\bashamed\b|\bshame on\b|\byou owe\b|\bbefore it'?s too late\b|\bi insist\b|\bno choice\b|\bfor the family'?s sake\b|\bselfish\b|\bultimatum\b/iu;
const enNegated = /\b(don'?t|do not|doesn'?t|never|no one|nobody)\s+(have to|need to|must)\b/iu;
const arPressure =
  /يجب عليك|يجب أن|لازم|عليك أن|عليكم أن|لا بد أن|لابد أن|إن لم|ان لم|وإلا|والا|ذنبك|خطؤك|خطأك|بسببك|عار عليك|عيب عليك|أنانية|انانية|لا خيار/u;
const arNegated = /لست مضطر|لستِ مضطرة|غير مضطر|لا يلزم/u;

// Carriers described as ill. Negations ("doesn't make me ill") are fine.
const enCarrierIll =
  /\b(i'?m|i am|carriers?\s+(is|are))\s+(sick|ill|affected|diseased|not healthy|unhealthy)\b|\bcarriers? (has|have) the disease\b/iu;
const arCarrierIll = /(أنا|انا)\s+(مريض|مريضة|مصاب|مصابة)|الحامل(ون|ين)?\s+(مرضى|مريض|مصابون)|حامل الصفة مريض/u;

function arabicShare(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[؀-ۿ]/u.test(c)).length / letters.length : 0;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

const numbers = (text: string) => new Set(text.match(/\d+(?:[.,]\d+)?\s?%?/gu) ?? []);

export function checkDraft(rewrite: string, original: string, locale: 'en' | 'ar'): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const text = rewrite.trim();
  if (!text) return ['unsafe'];
  // Both languages' rules always apply (a reply can mix them).
  if (enPressure.test(text.replace(enNegated, '')) || (arPressure.test(text) && !arNegated.test(text))) {
    problems.push('pressure');
  }
  if (enCarrierIll.test(text) || arCarrierIll.test(text)) problems.push('carrier_not_healthy');
  if (wordCount(text) >= MAX_DRAFT_WORDS) problems.push('too_long');
  const share = arabicShare(text);
  if ((locale === 'ar' && share < 0.6) || (locale === 'en' && share > 0.1)) problems.push('wrong_language');
  // No medical facts beyond the user's own words: no new numbers or chances.
  const before = numbers(original);
  if ([...numbers(text)].some((n) => !before.has(n))) problems.push('new_numbers');
  // The assistant's general reply check: diagnosis, marriage advice, rulings, medication.
  if (checkReply(text, [], []).problems.some((p) => p !== 'unverified_number')) problems.push('unsafe');
  return problems;
}
