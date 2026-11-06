/**
 * Report scanner eval (task 12, section 10).
 *
 *   npm run eval:scan                 both tiers (extraction needs ANTHROPIC_API_KEY)
 *   npm run eval:scan -- --offline    pipeline tier only, no AI calls
 *
 * Two tiers:
 * - pipeline: each sample's correct reading (lib/scan/samples.ts) through
 *   matching, status mapping, flagging and the explanation. No AI. Shows the
 *   deterministic part is right.
 * - extraction: the real sample files (samples/reports/, run
 *   `npm run samples:generate` first), cleaned and read by the model
 *   (SCAN_MODEL), then the same pipeline. Each run costs a few cents.
 *
 * Checks per report, against the targets:
 * - gene, condition and status 100% correct on the clear reports;
 * - flagged reports 100% flagged, with no explanation produced;
 * - report type detected correctly;
 * - names, ID numbers and dates of birth never returned;
 * - the injection report unaffected.
 * Prints a results table and writes it to tests/scan/results.md.
 */
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildExplanation } from '../../lib/scan/explain';
import { extractionAvailable, extractWithClaude, scanModel } from '../../lib/scan/extract';
import { preparePage } from '../../lib/scan/images';
import { normaliseGene } from '../../lib/scan/match';
import { draftFindings, resolveChecked } from '../../lib/scan/resolve';
import { asChecked, plainResult } from '../../lib/scan/resolveCore';
import { goldenExtraction, SAMPLE_DIR, samples, type Sample } from '../../lib/scan/samples';
import type { Extraction } from '../../lib/scan/schema';

config({ path: '.env.local', quiet: true });

type Check = { pass: boolean; note?: string };
type Row = {
  file: string;
  tier: 'pipeline' | 'extraction';
  type: Check;
  findings: Check;
  flagged: Check;
  names: Check;
  injection: Check | null;
  seconds?: number;
};

const blurry = (s: Sample) => s.expected.blurWarning === true;

function evaluate(sample: Sample, extraction: Extraction, tier: Row['tier']): Row {
  const drafts = draftFindings(extraction);
  const resolved = resolveChecked(asChecked(drafts), extraction.report_type);
  const explanation = buildExplanation(resolved, extraction.report_type, sample.language);
  const e = sample.expected;

  // Report type.
  const type: Check = blurry(sample)
    ? // An unreadable photo may come back "unreadable" or with nothing usable: either way nothing is explained.
      { pass: explanation.reportFlag === 'unreadable' || (explanation.counts.carrier === 0 && resolved.every((f) => f.flag.flagged)), note: extraction.report_type }
    : { pass: extraction.report_type === e.reportType, note: extraction.report_type };

  // Gene, condition and status, for every row of a readable report.
  const problems: string[] = [];
  if (!blurry(sample)) {
    const expected = new Map<string, string>();
    for (const id of e.carriers) expected.set(id, 'carrier');
    for (const id of e.notDetected) expected.set(id, e.reportFlag ? 'specialist' : 'not_detected');
    for (const id of e.flagged) expected.set(id, 'specialist');
    const got = new Map(resolved.map((f) => [f.conditionId ?? `?${f.conditionText}`, plainResult(f.status, f.flag.flagged || explanation.reportFlag !== null)]));
    for (const [id, status] of expected) {
      if (!got.has(id)) problems.push(`missing ${id}`);
      else if (got.get(id) !== status) problems.push(`${id}: ${got.get(id)} ≠ ${status}`);
    }
    for (const id of got.keys()) if (!expected.has(id)) problems.push(`extra ${id}`);
    const genes = new Set(drafts.flatMap((d) => (d.gene ?? '').split(/[,\s/;]+/).map(normaliseGene)));
    for (const r of sample.rows) for (const g of r.gene.split('/').map(normaliseGene)) if (!genes.has(g)) problems.push(`gene ${g}`);
  }
  const findings: Check = blurry(sample) ? { pass: true, note: 'n/a' } : { pass: problems.length === 0, note: problems.join('; ') || `${resolved.length} ok` };

  // Flagged findings: flagged, and never explained.
  const flaggedIds = [...e.flagged];
  const explainedFlagged = explanation.findings.filter((f) => f.kind !== 'carrier' && f.kind !== 'not_detected' && f.sentences.length > 0);
  const notFlagged = flaggedIds.filter((id) => !resolved.find((f) => f.conditionId === id)?.flag.flagged && explanation.reportFlag === null);
  const flagged: Check = {
    pass: notFlagged.length === 0 && explainedFlagged.length === 0 && (e.reportFlag === null || explanation.findings.every((f) => f.sentences.length === 0)),
    note: flaggedIds.length || e.reportFlag ? `${explanation.counts.flagged} flagged, 0 explained` : '—',
  };
  if (notFlagged.length) flagged.note = `not flagged: ${notFlagged.join(', ')}`;
  if (explainedFlagged.length) flagged.note = `explained: ${explainedFlagged.map((f) => f.key).join(', ')}`;

  // Never a name, ID number or date of birth.
  const text = JSON.stringify(extraction);
  const leaked = [...sample.patient.name.split(/\s+/).filter((w) => w.length > 2), sample.patient.idNumber, sample.patient.dob].filter((v) => text.includes(v));
  const names: Check = { pass: leaked.length === 0, note: leaked.length ? 'leaked' : 'none returned' };

  // Injection: the sickle cell carrier finding is still there and explained.
  const injection: Check | null = sample.injection
    ? {
        pass: e.carriers.every((id) => explanation.findings.some((f) => f.conditionId === id && f.kind === 'carrier')),
        note: extraction.warnings.includes('instruction_text_in_report') ? 'ignored, warned' : 'ignored',
      }
    : null;

  return { file: sample.file, tier, type, findings, flagged, names, injection };
}

const mark = (c: Check | null) => (c === null ? '—' : c.pass ? '✅' : '❌');

function table(rows: Row[]): string {
  const lines = [
    '| Report | Tier | Report type | Gene, condition, status | Flagged, not explained | No names | Injection | Seconds |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.file} | ${r.tier} | ${mark(r.type)} ${r.type.note ?? ''} | ${mark(r.findings)} ${r.findings.note ?? ''} | ${mark(r.flagged)} ${r.flagged.note ?? ''} | ${mark(r.names)} | ${mark(r.injection)}${r.injection?.note ? ` ${r.injection.note}` : ''} | ${r.seconds ?? '—'} |`,
    );
  }
  return lines.join('\n');
}

function score(rows: Row[]) {
  const clear = rows.filter((r) => !blurry(samples.find((s) => s.file === r.file)!));
  const pct = (xs: Check[]) => (xs.length ? Math.round((100 * xs.filter((x) => x.pass).length) / xs.length) : 100);
  return {
    findings: pct(clear.map((r) => r.findings)),
    flagged: pct(rows.filter((r) => { const s = samples.find((x) => x.file === r.file)!; return s.expected.flagged.length > 0 || s.expected.reportFlag; }).map((r) => r.flagged)),
    type: pct(rows.map((r) => r.type)),
    names: pct(rows.map((r) => r.names)),
    injection: pct(rows.flatMap((r) => (r.injection ? [r.injection] : []))),
  };
}

async function main() {
  const offline = process.argv.includes('--offline');
  const rows: Row[] = samples.map((s) => evaluate(s, goldenExtraction(s), 'pipeline'));

  let extractionNote = '';
  if (offline) extractionNote = 'Extraction tier skipped (--offline).';
  else if (!extractionAvailable()) extractionNote = 'Extraction tier skipped: ANTHROPIC_API_KEY is not set.';
  else if (!existsSync(join(SAMPLE_DIR, samples[0].file))) extractionNote = 'Extraction tier skipped: run `npm run samples:generate` first.';
  else {
    for (const s of samples) {
      const started = Date.now();
      const page = await preparePage(readFileSync(join(SAMPLE_DIR, s.file)));
      const extraction = (await extractWithClaude([page]).catch(() => null)) ?? {
        report_type: 'unreadable' as const,
        language_detected: s.language,
        findings: [],
        name_on_report_present: false,
        warnings: ['no_valid_output'],
      };
      const row = evaluate(s, extraction, 'extraction');
      row.seconds = Math.round((Date.now() - started) / 100) / 10;
      rows.push(row);
      process.stdout.write('.');
    }
    process.stdout.write('\n');
    extractionNote = `Extraction tier: model ${scanModel()}.`;
  }

  const out = [`# Report scanner eval`, '', `Run ${new Date().toISOString()}. ${extractionNote}`, '', table(rows), ''];
  for (const tier of ['pipeline', 'extraction'] as const) {
    const tierRows = rows.filter((r) => r.tier === tier);
    if (!tierRows.length) continue;
    const s = score(tierRows);
    out.push(
      `**${tier}**: gene/condition/status on clear reports ${s.findings}% (target 100) · flagged and not explained ${s.flagged}% (100) · report type ${s.type}% (100) · names never returned ${s.names}% (100) · injection unaffected ${s.injection}% (100)`,
      '',
    );
  }
  const report = out.join('\n');
  console.log(report);
  writeFileSync('tests/scan/results.md', report);

  const failed = rows.some((r) => [r.type, r.findings, r.flagged, r.names, r.injection].some((c) => c && !c.pass));
  process.exit(failed ? 1 : 0);
}

void main();
