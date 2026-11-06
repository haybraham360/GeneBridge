/**
 * Builds the explanation of a scanned report (task 12, section 3 step 7)
 * from the condition catalogue and the fixed connecting sentences in
 * content/library/{locale}/scan/explanation.json. Nothing here comes from a
 * model. Flagged findings get no explanation and no numbers (guardrail 4);
 * a report that isn't a carrier screen gets none at all.
 *
 * Condition names come from the catalogue in the explanation language. Gene
 * symbols keep their standard spelling in every language.
 */
import arTemplates from '@/content/library/ar/scan/explanation.json';
import enTemplates from '@/content/library/en/scan/explanation.json';
import { getEntry } from '@/lib/assistant/library';
import arConditions from '@/messages/ar/conditions.json';
import enConditions from '@/messages/en/conditions.json';
import type { ReportType } from './schema';
import type { ExplainedFinding, Explanation, ResolvedFinding, ScanLocale } from './types';

type Templates = typeof enTemplates;
const templates: Record<ScanLocale, Templates> = { en: enTemplates, ar: arTemplates };

/** The same pattern names as the rest of the app (messages/{locale}/conditions.json). */
const patternLabels: Record<ScanLocale, typeof enConditions.patterns> = {
  en: enConditions.patterns,
  ar: arConditions.patterns,
};

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

/** "A", "A and B", "A, B and C" in the locale. */
export function list(items: string[], locale: ScanLocale): string {
  const t = templates[locale];
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(t.list_comma)}${t.list_and}${items[items.length - 1]}`;
}

/** Splits catalogue text into sentences, for captions read one at a time. */
export function sentences(text: string | undefined): string[] {
  if (!text) return [];
  return (text.match(/[^.!?؟]+[.!?؟]+["')\]]*|[^.!?؟]+$/gu) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A single gene symbol, or null for "HBA1, HBA2". */
function singleGene(gene: string | null | undefined): string | null {
  return gene && !/[,\s/]/.test(gene.trim()) ? gene.trim() : null;
}

function explainFinding(f: ResolvedFinding, locale: ScanLocale): ExplainedFinding {
  const t = templates[locale];
  const entry = f.conditionId ? getEntry(f.conditionId, locale) : null;
  const gene = singleGene(entry?.gene) ?? singleGene(f.gene);
  const base = {
    key: f.key,
    conditionId: entry ? f.conditionId : null,
    title: entry?.title ?? f.conditionText,
    gene: entry?.gene ?? f.gene,
    asWritten: f.conditionText,
    pattern: entry ? patternLabels[locale][entry.inheritance ?? 'complex'] : null,
    carrierLabel: null,
    diseaseLabel: null,
    carrierShort: null,
    diseaseShort: null,
  };

  if (!entry) return { ...base, kind: 'unmatched', sentences: [], simple: [] };
  if (f.flag.flagged || f.skipped) return { ...base, kind: 'specialist', sentences: [], simple: [] };
  if (f.status === 'not_detected') return { ...base, kind: 'not_detected', sentences: [], simple: [] };
  if (f.status !== 'carrier') return { ...base, kind: 'specialist', sentences: [], simple: [] };

  const heading = gene
    ? fill(t.carrier_heading, { gene, condition: entry.title })
    : fill(t.carrier_heading_no_gene, { condition: entry.title });
  return {
    ...base,
    kind: 'carrier',
    sentences: [
      heading,
      ...sentences(t.carrier_healthy),
      ...sentences(entry.carrier_meaning ?? entry.summary),
      ...sentences(entry.inheritance_plain),
      ...sentences(t.same_gene),
    ],
    simple: [heading, ...sentences(entry.carrier_short ?? entry.card_summary ?? entry.summary), ...sentences(t.same_gene_simple)],
    carrierLabel: entry.carrier_label ?? entry.title,
    diseaseLabel: entry.disease_label ?? entry.title,
    carrierShort: entry.carrier_short ?? null,
    diseaseShort: entry.disease_short ?? null,
  };
}

export function buildExplanation(findings: ResolvedFinding[], reportType: ReportType, locale: ScanLocale): Explanation {
  const t = templates[locale];
  const counts = { carrier: 0, notDetected: 0, flagged: 0, skipped: 0 };

  const reportFlag: Explanation['reportFlag'] =
    reportType === 'unreadable' || findings.length === 0 ? 'unreadable' : reportType !== 'carrier_screening' ? 'other_report' : null;

  const explained = findings.map((f) => {
    // A report that isn't a carrier screen: nothing is explained, whatever it says.
    const e = reportFlag ? { ...explainFinding({ ...f, flag: { flagged: true, reason: 'other_report' } }, locale), sentences: [], simple: [] } : explainFinding(f, locale);
    if (f.skipped) counts.skipped++;
    else if (e.kind === 'carrier') counts.carrier++;
    else if (e.kind === 'not_detected') counts.notDetected++;
    else counts.flagged++;
    return e;
  });

  if (reportFlag) {
    const line = reportFlag === 'unreadable' ? t.summary_unreadable : t.summary_other_report;
    return { locale, summary: sentences(line), summarySimple: sentences(line), findings: explained, counts, reportFlag, smoothed: false };
  }

  const carriers = explained.filter((f) => f.kind === 'carrier').map((f) => f.title);
  const summary: string[] = [];
  const simple: string[] = [];
  if (carriers.length > 0) {
    const first = fill(t.summary_carrier, { conditions: list(carriers, locale) });
    summary.push(first, ...sentences(t.summary_carrier_body));
    simple.push(first, ...sentences(t.summary_carrier_body_simple));
  } else if (counts.flagged === 0) {
    summary.push(...sentences(t.summary_none), ...sentences(t.summary_none_body));
    simple.push(...sentences(t.summary_none));
  } else {
    summary.push(...sentences(t.summary_flagged_only));
    simple.push(...sentences(t.summary_flagged_only));
  }
  if (counts.flagged > 0 && carriers.length > 0) {
    summary.push(...sentences(t.summary_flagged));
    simple.push(...sentences(t.summary_flagged));
  }
  if (counts.skipped > 0) {
    summary.push(...sentences(t.summary_skipped));
    simple.push(...sentences(t.summary_skipped));
  }

  return { locale, summary, summarySimple: simple, findings: explained, counts, reportFlag, smoothed: false };
}

export { spokenSentences } from './spoken';
