import { describe, expect, it } from 'vitest';
import ar from '@/messages/ar/nearby.json';
import en from '@/messages/en/nearby.json';

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

describe('nearby copy', () => {
  it('is never directive: a directory, not a ranking (guardrail 1)', () => {
    for (const s of strings(en)) expect(s).not.toMatch(/\b(recommended|best|top|you should)\b/i);
    for (const s of strings(ar)) expect(s).not.toMatch(/(الأفضل|يُنصح|ننصح|موصى)/);
  });

  it('has the same keys in Arabic and English', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
});
