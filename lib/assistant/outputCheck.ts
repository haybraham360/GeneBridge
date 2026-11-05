/**
 * Step 2 of the two-step safety check (task 06, section 2): every reply is
 * checked before the user sees any of it. A failed reply is replaced with a
 * safe fallback and a counsellor offer.
 *
 * Checks: directive words, risk numbers the inheritance engine didn't
 * return this turn, diagnosis language, marriage advice, religious rulings
 * and medication or dosing advice. In both languages.
 */
export type CheckProblem =
  | 'directive'
  | 'unverified_number'
  | 'diagnosis'
  | 'marriage_advice'
  | 'religious_ruling'
  | 'medication';

const any = (...p: string[]) => new RegExp(p.join('|'), 'iu');

const checks: { problem: CheckProblem; pattern: RegExp }[] = [
  {
    problem: 'directive',
    pattern: any(
      '\\byou (should|must|ought to|need to (marry|cancel|stop|get|do))\\b',
      '\\bi (would )?(recommend|suggest|advise)\\b', '\\brecommended\\b', '\\bbest (option|choice|thing to do)\\b',
      '\\bthe right (choice|decision) (is|would be)\\b', '\\bif i were you\\b',
      'يجب (عليك|عليكم|ان تتزوج)', 'عليكم ان', 'انصح', 'ننصح', 'الخيار الافضل', 'افضل خيار', 'موصى به', 'لو كنت مكانك',
    ),
  },
  {
    problem: 'marriage_advice',
    pattern: any(
      "\\b(don'?t|do not|should(n'?t)?|better not|go ahead and) (get )?marr", '\\bsafe (for you )?to marry\\b',
      '\\bcall off\\b', '\\bcancel (the|your) (engagement|wedding)\\b', '\\b(not )?compatible (couple|for marriage)\\b',
      'لا تتزوج', 'تزوجوا', 'الغوا الخطوبه', 'الغاء الخطوبه', 'غير متوافقين',
    ),
  },
  {
    problem: 'diagnosis',
    pattern: any(
      "\\byou('re| are) (affected|sick|ill|diagnosed)\\b",
      '\\byou (have|suffer from) (sickle cell disease|thalass|cystic fibrosis|sma|pku|phenylketonuria|g6pd deficiency|the (condition|disease))',
      '\\byour (baby|child) (has|will have|is affected)\\b', '\\byou are a carrier of a disease\\b',
      'انت مصاب', 'انتي مصابه', 'لديك مرض', '(طفلك|طفلكم) (مصاب|سيكون مصابا)',
    ),
  },
  {
    problem: 'religious_ruling',
    pattern: any('\\b(is|isn\'?t|is not) (halal|haram|permissible|forbidden) in islam\\b', '\\bit is (halal|haram)\\b', 'حرام', 'حلال', 'فتوى بان'),
  },
  {
    problem: 'medication',
    pattern: any('\\b\\d+(\\.\\d+)?\\s?(mg|mcg|milligrams?|ml)\\b', '\\b(dose|dosage) of\\b', '\\btake \\d', 'جرعه', 'ملغ'),
  },
];

const arabicDigits = /[\u0660-\u0669]/g;
function westernDigits(text: string): string {
  return text.replace(arabicDigits, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/٪/g, '%');
}

/** Normalised for matching: lower case, Arabic letter forms unified, no diacritics. */
function prepare(text: string): string {
  return westernDigits(text)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/** Every chance stated in the text, as a percentage: "25%", "1 in 4", "2 out of 4". */
export function statedChances(text: string): number[] {
  const t = westernDigits(text);
  const found: number[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s?(%|percent|بالمئه|بالمائة|في المئة|في المائة)/giu)) {
    found.push(Number(m[1]));
  }
  for (const m of t.matchAll(/\b(\d+)\s*(?:in|out of|من(?: كل)?)\s*(\d+)\b/giu)) {
    const [n, d] = [Number(m[1]), Number(m[2])];
    if (d > 0 && d <= 1000 && n <= d) found.push((100 * n) / d);
  }
  return found;
}

export type CheckResult = { ok: boolean; problems: CheckProblem[] };

/**
 * @param allowedNumbers every percentage the engine returned this turn.
 */
export function checkReply(
  text: string,
  allowedNumbers: readonly number[],
  /** Text quoted from the user's own report: its lab values aren't risk numbers. */
  quoted: readonly string[] = [],
): CheckResult {
  const prepared = prepare(text);
  const problems = new Set<CheckProblem>();
  for (const { problem, pattern } of checks) {
    if (pattern.test(prepared) || pattern.test(text.toLowerCase())) problems.add(problem);
  }
  const allowed = new Set(allowedNumbers.map((n) => Math.round(n * 10) / 10));
  let own = text;
  for (const q of quoted) if (q.trim().length > 3) own = own.split(q.trim()).join(' ');
  for (const n of statedChances(own)) {
    if (!allowed.has(Math.round(n * 10) / 10)) problems.add('unverified_number');
  }
  return { ok: problems.size === 0, problems: [...problems] };
}
