import { describe, expect, it } from 'vitest';
import { normalisePhone } from './phoneFormat';
import { cleanSignedName, isNoticeCode } from './types';

describe('normalisePhone', () => {
  it('treats local, international and spaced UAE numbers the same', () => {
    const expected = '971501234567';
    expect(normalisePhone('050 123 4567')).toBe(expected);
    expect(normalisePhone('+971 50 123 4567')).toBe(expected);
    expect(normalisePhone('00971501234567')).toBe(expected);
    expect(normalisePhone('٠٥٠١٢٣٤٥٦٧')).toBe(expected);
  });

  it('rejects things that are not phone numbers', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('hello')).toBeNull();
    expect(normalisePhone('123')).toBeNull();
    expect(normalisePhone(42)).toBeNull();
  });
});

describe('notice codes and names', () => {
  it('accepts only long URL-safe codes', () => {
    expect(isNoticeCode('demoA7f3kQ9xLm2Pv8RtZc4Wn6Yb')).toBe(true);
    expect(isNoticeCode('short')).toBe(false);
    expect(isNoticeCode('has/slash/and/more/characters')).toBe(false);
  });

  it('cleans a signed name', () => {
    expect(cleanSignedName('  Mariam   A. ')).toBe('Mariam A.');
    expect(cleanSignedName('   ')).toBeNull();
    expect(cleanSignedName('x'.repeat(60))).toHaveLength(40);
  });
});
