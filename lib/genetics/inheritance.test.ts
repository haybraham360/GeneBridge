import { describe, expect, it } from 'vitest';
import {
  calculateInheritance,
  expectedCounts,
  InheritanceInputError,
  numbersIn,
} from './inheritance';

describe('autosomal recessive', () => {
  it('two carriers: 25 / 50 / 25 for each pregnancy', () => {
    const r = calculateInheritance('autosomal_recessive', 'carrier', 'carrier');
    expect(r.chances).toEqual({ affected: 25, carrier: 50, unaffected: 25 });
    expect(r.escalate).toBe(false);
  });

  it('carrier and unaffected: no affected child, 50% carriers', () => {
    expect(calculateInheritance('autosomal_recessive', 'carrier', 'unaffected').chances).toEqual({
      affected: 0,
      carrier: 50,
      unaffected: 50,
    });
  });

  it('affected and carrier: 50 / 50', () => {
    expect(calculateInheritance('autosomal_recessive', 'affected', 'carrier').chances).toEqual({
      affected: 50,
      carrier: 50,
      unaffected: 0,
    });
  });

  it('affected and unaffected: every child a carrier', () => {
    expect(calculateInheritance('autosomal_recessive', 'affected', 'unaffected').chances).toEqual({
      affected: 0,
      carrier: 100,
      unaffected: 0,
    });
  });

  it('is symmetric in the parents', () => {
    const a = calculateInheritance('autosomal_recessive', 'carrier', 'affected');
    const b = calculateInheritance('autosomal_recessive', 'affected', 'carrier');
    expect(a.chances).toEqual(b.chances);
  });
});

describe('autosomal dominant', () => {
  it('one affected parent: 50% for each pregnancy, and escalates', () => {
    const r = calculateInheritance('autosomal_dominant', 'affected', 'unaffected');
    expect(r.chances).toEqual({ affected: 50, carrier: 0, unaffected: 50 });
    expect(r.escalate).toBe(true);
  });

  it('two affected parents: 75%', () => {
    expect(calculateInheritance('autosomal_dominant', 'affected', 'affected').chances.affected).toBe(
      75,
    );
  });

  it('rejects carriers, which a dominant condition does not have', () => {
    expect(() => calculateInheritance('autosomal_dominant', 'carrier', 'unaffected')).toThrow(
      InheritanceInputError,
    );
  });
});

describe('X-linked', () => {
  it('carrier mother, unaffected father: sons 50% affected, daughters 50% carriers', () => {
    const r = calculateInheritance('x_linked', 'carrier', 'unaffected');
    expect(r.bySex?.son).toEqual({ affected: 50, carrier: 0, unaffected: 50 });
    expect(r.bySex?.daughter).toEqual({ affected: 0, carrier: 50, unaffected: 50 });
    expect(r.chances).toEqual({ affected: 25, carrier: 25, unaffected: 50 });
    expect(r.escalate).toBe(true);
  });

  it('unaffected mother, affected father: every daughter a carrier, no affected sons', () => {
    const r = calculateInheritance('x_linked', 'unaffected', 'affected');
    expect(r.bySex?.son).toEqual({ affected: 0, carrier: 0, unaffected: 100 });
    expect(r.bySex?.daughter).toEqual({ affected: 0, carrier: 100, unaffected: 0 });
  });

  it('carrier mother, affected father', () => {
    const r = calculateInheritance('x_linked', 'carrier', 'affected');
    expect(r.bySex?.son).toEqual({ affected: 50, carrier: 0, unaffected: 50 });
    expect(r.bySex?.daughter).toEqual({ affected: 50, carrier: 50, unaffected: 0 });
  });

  it('rejects a carrier father', () => {
    expect(() => calculateInheritance('x_linked', 'carrier', 'carrier')).toThrow(
      InheritanceInputError,
    );
  });
});

describe('helpers', () => {
  it('chances always add up to 100', () => {
    for (const p of ['autosomal_recessive', 'x_linked'] as const) {
      for (const a of ['unaffected', 'carrier', 'affected'] as const) {
        for (const b of ['unaffected', 'affected'] as const) {
          const { chances } = calculateInheritance(p, a, b);
          expect(chances.affected + chances.carrier + chances.unaffected).toBe(100);
        }
      }
    }
  });

  it('lists every number the engine returned', () => {
    const r = calculateInheritance('x_linked', 'carrier', 'unaffected');
    expect(new Set(numbersIn(r))).toEqual(new Set([25, 50, 0]));
  });

  it('gives expected counts out of 100 runs', () => {
    const r = calculateInheritance('autosomal_recessive', 'carrier', 'carrier');
    expect(expectedCounts(r, 100)).toEqual({ affected: 25, carrier: 50, unaffected: 25 });
  });
});
