import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { equityFlags } from './equity';
import { exportFileName, filtersQuery, parseFilters, rangeDays } from './filters';
import type { EquityRow } from './types';

const centres = ['[Centre A]', '[Centre B]', '[Centre C]'];

describe('parseFilters', () => {
  it('defaults to the last 90 days and all centres', () => {
    expect(parseFilters({}, centres)).toEqual({ range: '90', centre: null });
  });

  it('accepts known ranges and centres only', () => {
    expect(parseFilters({ range: '30', centre: '[Centre B]' }, centres)).toEqual({
      range: '30',
      centre: '[Centre B]',
    });
    expect(parseFilters({ range: '31', centre: '[Centre Z]' }, centres)).toEqual({
      range: '90',
      centre: null,
    });
    expect(parseFilters({ range: ['all', '30'] }, centres).range).toBe('all');
  });

  it('maps ranges to the only windows the database accepts', () => {
    expect(rangeDays('30')).toBe(30);
    expect(rangeDays('90')).toBe(90);
    expect(rangeDays('all')).toBeNull();
  });

  it('leaves defaults out of the query string', () => {
    expect(filtersQuery({ range: '90', centre: null })).toBe('');
    expect(filtersQuery({ range: 'all', centre: '[Centre A]' })).toBe(
      '?range=all&centre=%5BCentre+A%5D',
    );
  });
});

describe('exportFileName', () => {
  const now = new Date('2026-11-04T12:00:00Z');

  it('uses the window dates', () => {
    expect(exportFileName('30', now)).toBe('genebridge-impact-2026-10-05-2026-11-04.csv');
    expect(exportFileName('90', now)).toBe('genebridge-impact-2026-08-06-2026-11-04.csv');
  });

  it('says all-time when there is no fixed start', () => {
    expect(exportFileName('all', now)).toBe('genebridge-impact-all-time-2026-11-04.csv');
  });
});

describe('equityFlags', () => {
  const overall = { gain: 34, uptakePct: 71 };
  const row = (gain: number | null, uptakePct: number | null): EquityRow => ({
    language: 'ur',
    users: 120,
    gain,
    uptakePct,
    medianDays: 8,
  });

  it('flags a gap of more than 5 points', () => {
    expect(equityFlags(row(28.9, 71), overall)).toEqual({ gain: true, uptake: false, any: true });
    expect(equityFlags(row(34, 64), overall)).toEqual({ gain: false, uptake: true, any: true });
  });

  it('does not flag exactly 5 points, or figures above average', () => {
    expect(equityFlags(row(29, 66), overall).any).toBe(false);
    expect(equityFlags(row(40, 80), overall).any).toBe(false);
  });

  it('never flags hidden figures', () => {
    expect(equityFlags(row(null, null), overall).any).toBe(false);
    expect(equityFlags(row(10, 10), { gain: null, uptakePct: null }).any).toBe(false);
  });
});

describe('toCsv', () => {
  it('quotes and neutralises cells', () => {
    const csv = toCsv([
      ['Measure', 'Value'],
      ['Has, comma', 12],
      ['=HYPERLINK("x")', null],
    ]);
    expect(csv).toBe(
      '﻿Measure,Value\r\n"Has, comma",12\r\n"\'=HYPERLINK(""x"")",\r\n',
    );
  });
});
