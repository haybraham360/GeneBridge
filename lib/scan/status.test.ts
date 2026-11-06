import { describe, expect, it } from 'vitest';
import { dbStatus, mapStatus } from './status';
import type { Classification, ReportedResult, Zygosity } from './schema';

const map = (zygosity: Zygosity, classification: Classification, result: ReportedResult, pattern: Parameters<typeof mapStatus>[1]) =>
  mapStatus({ zygosity, classification, reported_result: result }, pattern);

describe('status mapping: zygosity × pattern × classification', () => {
  it('heterozygous pathogenic or likely pathogenic, recessive → carrier', () => {
    for (const c of ['pathogenic', 'likely_pathogenic'] as const) {
      expect(map('heterozygous', c, 'carrier', 'autosomal_recessive')).toEqual({ status: 'carrier', conflicting: false });
      // The lab stating the classification alone is enough.
      expect(map('heterozygous', c, 'unknown', 'autosomal_recessive').status).toBe('carrier');
    }
  });

  it('a lab-stated carrier result with no other detail → carrier', () => {
    expect(map('unknown', 'unknown', 'carrier', 'autosomal_recessive').status).toBe('carrier');
  });

  it('homozygous or hemizygous → affected, whatever the pattern', () => {
    for (const z of ['homozygous', 'hemizygous'] as const) {
      for (const p of ['autosomal_recessive', 'autosomal_dominant', 'x_linked', null] as const) {
        expect(map(z, 'pathogenic', 'affected', p).status).toBe('affected');
        expect(map(z, 'pathogenic', 'unknown', p).status).toBe('affected');
      }
    }
  });

  it('any change for a dominant or X-linked condition → affected', () => {
    for (const p of ['autosomal_dominant', 'x_linked'] as const) {
      expect(map('heterozygous', 'pathogenic', 'carrier', p).status).toBe('affected');
      expect(map('heterozygous', 'likely_pathogenic', 'unknown', p).status).toBe('affected');
      expect(map('unknown', 'unknown', 'carrier', p).status).toBe('affected');
    }
  });

  it('uncertain → uncertain, from the classification or the result', () => {
    expect(map('heterozygous', 'uncertain', 'carrier', 'autosomal_recessive').status).toBe('uncertain');
    expect(map('heterozygous', 'unknown', 'uncertain', 'autosomal_recessive').status).toBe('uncertain');
    expect(map('heterozygous', 'uncertain', 'unknown', 'x_linked').status).toBe('uncertain');
  });

  it('not detected → not_detected, for every pattern', () => {
    for (const p of ['autosomal_recessive', 'autosomal_dominant', 'x_linked', 'complex', null] as const) {
      expect(map('unknown', 'unknown', 'not_detected', p)).toEqual({ status: 'not_detected', conflicting: false });
    }
  });

  it('benign → not_detected; benign with a carrier result → conflicting', () => {
    expect(map('heterozygous', 'benign', 'unknown', 'autosomal_recessive').status).toBe('not_detected');
    expect(map('heterozygous', 'likely_benign', 'not_detected', 'autosomal_recessive').status).toBe('not_detected');
    expect(map('heterozygous', 'benign', 'carrier', 'autosomal_recessive')).toEqual({ status: 'unknown', conflicting: true });
  });

  it('contradictions → unknown and conflicting', () => {
    expect(map('heterozygous', 'pathogenic', 'not_detected', 'autosomal_recessive').conflicting).toBe(true);
    expect(map('homozygous', 'pathogenic', 'carrier', 'autosomal_recessive').conflicting).toBe(true);
  });

  it('never infers a result from nothing', () => {
    expect(map('unknown', 'unknown', 'unknown', 'autosomal_recessive')).toEqual({ status: 'unknown', conflicting: false });
    expect(map('heterozygous', 'unknown', 'unknown', 'autosomal_recessive').status).toBe('unknown');
  });

  it('maps to the database status words', () => {
    expect(dbStatus('not_detected')).toBe('no_variant');
    expect(dbStatus('unknown')).toBe('uncertain');
    expect(dbStatus('carrier')).toBe('carrier');
  });
});
