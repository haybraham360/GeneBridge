/**
 * Screening report explanation (task 06, 1b point 2). Works on text the user
 * pasted, or text extracted from an uploaded PDF or photo (AI mode only; the
 * file itself is never stored).
 *
 * - Personal details (name, date of birth, ID and phone numbers) are removed
 *   before anything is stored or explained.
 * - If anything looks uncertain, severe, X-linked or unlike the stored
 *   result, it stops and escalates without interpreting.
 */
import { normalise } from './library';
import type { AssistantLocale, ResultSummary } from './types';

const MAX_LINES = 30;

const personalLine =
  /\b(name|patient|d\.?o\.?b|date of birth|birth ?date|emirates id|\bid\b|mrn|passport|phone|mobile|address|reference|ref\.? ?no)\b|الاسم|اسم المريض|تاريخ الميلاد|رقم الهويه|الهويه الاماراتيه|جواز|هاتف|العنوان/i;

/** Long digit runs (IDs, phone numbers) are masked even inside other lines. */
function maskNumbers(line: string): string {
  return line.replace(/\b\d[\d\s-]{6,}\d\b/g, '[…]').replace(/\b784-?\d{4}-?\d{7}-?\d\b/g, '[…]');
}

export function redactReport(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map((l) => (personalLine.test(normalise(l)) || personalLine.test(l) ? '[personal details removed]' : maskNumbers(l)))
    .join('\n');
}

type Term = { pattern: RegExp; en: string; ar: string; library?: string };

const terms: Term[] = [
  {
    pattern: /\bhbas\b|sickle cell trait|\bhb ?as\b/i,
    en: 'HbAS means one typical copy (A) and one sickle copy (S): a healthy carrier of sickle cell, sometimes called sickle cell trait.',
    ar: 'HbAS تعني نسخة طبيعية (A) ونسخة منجلية (S): حامل سليم لصفة فقر الدم المنجلي، وتُسمّى أحياناً سمة الخلية المنجلية.',
    library: 'sickle_cell_disease',
  },
  {
    pattern: /\bhba2\b/i,
    en: 'HbA2 is a small type of haemoglobin. A raised HbA2 level is a common sign of beta-thalassaemia trait (a healthy carrier).',
    ar: 'HbA2 نوع صغير من الهيموغلوبين. ارتفاع مستواه علامة شائعة على حمل صفة الثلاسيميا بيتا (حامل سليم).',
    library: 'beta_thalassemia',
  },
  {
    pattern: /\bhbf\b/i,
    en: 'HbF is fetal haemoglobin, the kind babies make before birth. Adults usually have only a little.',
    ar: 'HbF هو الهيموغلوبين الجنيني الذي يصنعه الطفل قبل الولادة، ويكون لدى البالغين بكمية قليلة عادةً.',
  },
  {
    pattern: /\bhbs\b|sickle haemoglobin|sickle hemoglobin/i,
    en: 'HbS is sickle haemoglobin, the form linked to sickle cell.',
    ar: 'HbS هو الهيموغلوبين المنجلي المرتبط بفقر الدم المنجلي.',
    library: 'sickle_cell_disease',
  },
  {
    pattern: /\bmcv\b|\bmch\b/i,
    en: 'MCV and MCH measure the size and colour of red blood cells. Small cells can be a sign of thalassaemia trait, or of low iron.',
    ar: 'MCV وMCH يقيسان حجم خلايا الدم الحمراء ولونها. صغر الخلايا قد يكون علامة على حمل صفة الثلاسيميا أو على نقص الحديد.',
    library: 'beta_thalassemia',
  },
  {
    pattern: /heterozygous|heterozygote|\bcarrier\b|\btrait\b|\bminor\b|حامل|خلط/i,
    en: 'Heterozygous / carrier: one changed copy and one typical copy. For recessive conditions, carriers are healthy.',
    ar: 'متخالف / حامل: نسخة متغيّرة ونسخة طبيعية. في الحالات المتنحية يكون حامل الصفة سليماً.',
    library: 'what_is_a_carrier',
  },
  {
    pattern: /\bhbaa\b|no (pathogenic )?variants? (were )?(detected|found|identified)|\bnegative\b|\bnormal\b|لم يتم الكشف|طبيعي/i,
    en: 'No changed copy was found in the genes that were tested. No test covers every gene.',
    ar: 'لم يُعثر على نسخة متغيّرة في الجينات التي فُحصت. لا يوجد فحص يشمل كل الجينات.',
  },
  {
    pattern: /\bpathogenic\b|disease-causing|ممرض/i,
    en: '"Pathogenic" means the change is known to affect how the gene works. For a recessive condition, one pathogenic copy means being a healthy carrier.',
    ar: '"ممرض" يعني أن التغيّر معروف بتأثيره في عمل الجين. في الحالة المتنحية، وجود نسخة ممرضة واحدة يعني أن الشخص حامل سليم.',
  },
  {
    pattern: /\bc\.\d|\bp\.[a-z]{3}\d|hgvs/i,
    en: 'Codes like "c.20A>T" or "p.Glu7Val" describe exactly where the change is in the gene. You do not need to understand them; your counsellor can.',
    ar: 'الرموز مثل "c.20A>T" أو "p.Glu7Val" تحدّد مكان التغيّر في الجين بدقة. لا تحتاج إلى فهمها، فالمستشار يستطيع شرحها.',
  },
  {
    pattern: /thalass|ثلاسيميا/i,
    en: 'Thalassaemia is an inherited condition affecting haemoglobin.',
    ar: 'الثلاسيميا حالة وراثية تؤثر في الهيموغلوبين.',
    library: 'beta_thalassemia',
  },
  {
    pattern: /\bsma\b|smn1/i,
    en: 'SMN1 is the gene linked to spinal muscular atrophy (SMA).',
    ar: 'SMN1 هو الجين المرتبط بضمور العضلات الشوكي.',
    library: 'spinal_muscular_atrophy',
  },
  {
    pattern: /\bcftr\b|cystic fibrosis/i,
    en: 'CFTR is the gene linked to cystic fibrosis.',
    ar: 'CFTR هو الجين المرتبط بالتليّف الكيسي.',
    library: 'cystic_fibrosis',
  },
];

/** Findings the assistant must never interpret: it escalates instead. */
const stopPattern =
  /uncertain significance|\bvus\b|unknown significance|conflicting|homozygous|compound heterozygous|hemizygous|\bhbss\b|\bhb ss\b|\baffected\b|x-linked|severe|major|disease detected|غير معروف الاهميه|غير مؤكد|متماثل|مصاب|شديد/i;

export type ReportLine = { text: string; explanations: string[]; library: string[] };

export type ReportAnalysis = {
  lines: ReportLine[];
  /** Escalate without interpreting. */
  stop: boolean;
  stopReason?: 'uncertain_or_severe' | 'differs_from_stored';
  /** Status the report seems to show, for the stored-result comparison. */
  seemsCarrier: boolean;
};

export function analyseReport(
  text: string,
  locale: AssistantLocale,
  stored?: ResultSummary | null,
): ReportAnalysis {
  const redacted = redactReport(text);
  const lines: ReportLine[] = redacted.split('\n').map((line) => {
    const matched = terms.filter((t) => t.pattern.test(line));
    return {
      text: line,
      explanations: matched.map((t) => (locale === 'ar' ? t.ar : t.en)),
      library: [...new Set(matched.map((t) => t.library).filter((l): l is string => Boolean(l)))],
    };
  });

  const seemsCarrier = /heterozygous|\bcarrier\b|\btrait\b|\bhbas\b|\bminor\b|حامل/i.test(redacted);
  if (stopPattern.test(redacted) || stopPattern.test(normalise(redacted))) {
    return { lines, stop: true, stopReason: 'uncertain_or_severe', seemsCarrier };
  }
  if (stored && !stored.escalate) {
    const storedCarrier = stored.status === 'carrier';
    if (storedCarrier !== seemsCarrier) {
      return { lines, stop: true, stopReason: 'differs_from_stored', seemsCarrier };
    }
  }
  return { lines, stop: false, seemsCarrier };
}
