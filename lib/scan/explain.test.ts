import { describe, expect, it, vi } from 'vitest';
import { statedChances } from '@/lib/assistant/outputCheck';
import { getEntry } from '@/lib/assistant/library';
import { buildExplanation, list, sentences } from './explain';
import { draftFindings, resolveChecked } from './resolve';
import { asChecked } from './resolveCore';
import { goldenExtraction, samples } from './samples';
import { rowsFor } from './save';
import type { CheckedFinding } from './types';

vi.mock('server-only', () => ({}));

const sample = (file: string) => samples.find((s) => s.file === file)!;

function explainSample(file: string, locale: 'en' | 'ar' = 'en') {
  const extraction = goldenExtraction(sample(file));
  const resolved = resolveChecked(asChecked(draftFindings(extraction)), extraction.report_type);
  return { resolved, explanation: buildExplanation(resolved, extraction.report_type, locale) };
}

describe('explanation builder', () => {
  it('explains each carrier finding from the catalogue, and says carriers are healthy', () => {
    const { explanation } = explainSample('mariam-report.pdf');
    const carriers = explanation.findings.filter((f) => f.kind === 'carrier');
    expect(carriers.map((f) => f.conditionId).sort()).toEqual(['beta_thalassemia', 'spinal_muscular_atrophy']);
    const beta = carriers.find((f) => f.conditionId === 'beta_thalassemia')!;
    const catalogue = getEntry('beta_thalassemia', 'en')!;
    expect(beta.sentences.join(' ')).toContain(sentences(catalogue.carrier_meaning)[0]);
    expect(beta.sentences.join(' ')).toContain('Carriers are healthy.');
    expect(explanation.summary[0]).toContain('You are healthy.');
    expect(explanation.counts).toMatchObject({ carrier: 2, notDetected: 6, flagged: 0 });
  });

  it('contains no numbers at all (risk numbers only come from the engine, elsewhere)', () => {
    for (const s of samples) {
      for (const locale of ['en', 'ar'] as const) {
        const { explanation } = explainSample(s.file, locale);
        const text = [...explanation.summary, ...explanation.findings.flatMap((f) => [...f.sentences, ...f.simple])].join(' ');
        expect(statedChances(text), `${s.file} ${locale}`).toEqual([]);
      }
    }
  });

  it('never explains a flagged finding', () => {
    for (const file of ['vus-report.pdf', 'xlinked-report.pdf']) {
      const { explanation } = explainSample(file);
      const flagged = explanation.findings.filter((f) => f.kind === 'specialist');
      expect(flagged.length, file).toBeGreaterThan(0);
      for (const f of flagged) {
        expect(f.sentences).toEqual([]);
        expect(f.simple).toEqual([]);
      }
      expect(explanation.counts.carrier).toBe(0);
    }
  });

  it('explains nothing on a report that is not a carrier screen', () => {
    const { explanation } = explainSample('diagnostic-report.pdf');
    expect(explanation.reportFlag).toBe('other_report');
    expect(explanation.summary).toEqual(['This looks like a different kind of report.', 'A counsellor can explain it properly.']);
    expect(explanation.findings.every((f) => f.sentences.length === 0)).toBe(true);
  });

  it('says it could not read an unreadable report', () => {
    expect(explainSample('blurry-photo.jpg').explanation.reportFlag).toBe('unreadable');
  });

  it('explains in the person’s language, keeping gene symbols as written', () => {
    const { explanation } = explainSample('arabic-report.pdf', 'ar');
    const cf = explanation.findings.find((f) => f.conditionId === 'cystic_fibrosis')!;
    expect(cf.kind).toBe('carrier');
    expect(cf.title).toBe(getEntry('cystic_fibrosis', 'ar')!.title);
    expect(cf.sentences[0]).toContain('CFTR');
    expect(cf.sentences[0]).toMatch(/[؀-ۿ]/);
    // An English report explained in Arabic.
    const mariam = explainSample('mariam-report.pdf', 'ar').explanation;
    expect(mariam.summary[0]).toContain(getEntry('beta_thalassemia', 'ar')!.title);
  });

  it('lists in each language', () => {
    expect(list(['A', 'B', 'C'], 'en')).toBe('A, B and C');
    expect(list(['أ', 'ب'], 'ar')).toBe('أ وب');
  });
});

describe('the server re-checks what the browser sends', () => {
  const base: CheckedFinding = {
    key: 'f1',
    conditionText: 'G6PD deficiency',
    gene: 'G6PD',
    zygosity: 'heterozygous',
    classification: 'pathogenic',
    reportedResult: 'carrier',
    conditionId: 'g6pd_deficiency',
    lowConfidence: false,
    confirmed: true,
    skipped: false,
  };

  it('an X-linked carrier stays flagged however it is sent', () => {
    expect(resolveChecked([base], 'carrier_screening')[0].flag).toEqual({ flagged: true, reason: 'x_linked' });
  });

  it('a made-up condition id is unmatched and flagged', () => {
    const [f] = resolveChecked([{ ...base, conditionId: 'not_a_condition', conditionText: 'Something', gene: null }], 'carrier_screening');
    expect(f.conditionId).toBeNull();
    expect(f.flag.flagged).toBe(true);
  });

  it('a different condition counts only once the person confirmed it', () => {
    const swapped = { ...base, conditionText: 'Cystic fibrosis', gene: 'CFTR', conditionId: 'beta_thalassemia' };
    expect(resolveChecked([{ ...swapped, confirmed: false }], 'carrier_screening')[0].conditionId).toBeNull();
    expect(resolveChecked([{ ...swapped, confirmed: true }], 'carrier_screening')[0].conditionId).toBe('beta_thalassemia');
  });

  it('a low-confidence finding stays flagged until confirmed', () => {
    const f = { ...base, conditionText: 'Cystic fibrosis', gene: 'CFTR', conditionId: 'cystic_fibrosis', lowConfidence: true };
    expect(resolveChecked([{ ...f, confirmed: false }], 'carrier_screening')[0].flag).toEqual({ flagged: true, reason: 'unreadable' });
    expect(resolveChecked([{ ...f, confirmed: true }], 'carrier_screening')[0].flag.flagged).toBe(false);
  });
});

describe('rows saved for a scanned report', () => {
  it('stores the interpretation only, flags kept, skipped findings left out', () => {
    const { resolved } = explainSample('vus-report.pdf');
    const rows = rowsFor([...resolved, { ...resolved[1], key: 'f99', skipped: true, conditionId: 'phenylketonuria' }]);
    const gjb2 = rows.find((r) => r.condition_code === 'gjb2_hearing_loss')!;
    expect(gjb2).toMatchObject({ status: 'uncertain', flagged: true, flag_reason: 'vus' });
    expect(rows.filter((r) => r.condition_code === 'phenylketonuria')).toHaveLength(1);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['condition_code', 'condition_text', 'flag_reason', 'flagged', 'genotype', 'status']);
    }
  });

  it('unmatched findings are saved flagged under their own code', () => {
    const rows = rowsFor([
      { key: 'f1', conditionText: 'Tay-Sachs disease', conditionId: null, gene: 'HEXA', zygosity: 'heterozygous', status: 'carrier', flag: { flagged: true, reason: 'unmatched' }, skipped: false },
    ]);
    expect(rows).toEqual([
      { condition_code: 'unlisted_1', status: 'carrier', genotype: 'heterozygous', flagged: true, flag_reason: 'unmatched', condition_text: 'Tay-Sachs disease' },
    ]);
  });
});
