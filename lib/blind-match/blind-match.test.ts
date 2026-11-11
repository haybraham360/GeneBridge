import ar from '@/messages/ar/blindMatch.json';
import en from '@/messages/en/blindMatch.json';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, formatCode, joinUrl, normaliseCode } from './code';
import { blindMatchConditions } from './conditions';
import { parseState } from './state';

describe('Blind Match conditions', () => {
  const dir = join(process.cwd(), 'content/library/en/conditions');
  const recessive = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id: string; inheritance?: string })
    .filter((c) => c.inheritance === 'autosomal_recessive')
    .map((c) => c.id)
    .sort();

  it('matches the autosomal recessive conditions in the catalogue', () => {
    expect(blindMatchConditions.filter((c) => c !== 'sickle_cell')).toEqual(recessive);
  });

  it('matches the list in the migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261118000000_blind_match.sql'), 'utf8');
    const block = sql.slice(sql.indexOf('insert into public.blind_match_conditions'), sql.indexOf('alter table public.blind_match_conditions'));
    const inSql = [...block.matchAll(/\('([a-z0-9_]+)'\)/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...blindMatchConditions].sort());
  });
});

describe('Blind Match codes', () => {
  it('has 31 unambiguous characters', () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it('reads typed codes and scanned links', () => {
    expect(normaliseCode(' abc-def ')).toBe('ABCDEF');
    expect(normaliseCode('ABO DEF')).toBeNull();
    expect(normaliseCode('k7m 2pq')).toBe('K7M2PQ');
    expect(normaliseCode(joinUrl('https://genebridge.app/', 'ar', 'K7M2PQ'))).toBe('K7M2PQ');
    expect(normaliseCode('https://example.com/?nothing=1')).toBeNull();
    expect(normaliseCode('K7M2P')).toBeNull();
    expect(normaliseCode('K7M2P0')).toBeNull();
    expect(formatCode('K7M2PQ')).toBe('K7M 2PQ');
  });
});

describe('Blind Match state', () => {
  it('treats anything unexpected as gone', () => {
    expect(parseState(null).status).toBe('gone');
    expect(parseState({ status: 'weird' }).status).toBe('gone');
  });

  it('keeps the reveal empty until both tapped', () => {
    const s = parseState({ status: 'resolved', role: 'joiner', outcome: 'shared', screened_codes: ['beta_thalassemia'], revealed_codes: null });
    expect(s.outcome).toBe('shared');
    expect(s.revealedCodes).toBeNull();
    expect(parseState({ status: 'resolved', outcome: 'shared', revealed_codes: ['beta_thalassemia'] }).revealedCodes).toEqual(['beta_thalassemia']);
  });
});

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

describe('Blind Match copy', () => {
  it('is never directive and never a verdict (guardrails 1 and 2)', () => {
    for (const s of strings(en)) {
      expect(s).not.toMatch(/\b(recommended|best|should|compatible|compatibility|safe to marry|risk-free|incompatible)\b/i);
    }
    for (const s of strings(ar)) expect(s).not.toMatch(/(الأفضل|يُنصح|ننصح|موصى|متوافق|آمن للزواج|يجب)/);
  });

  it('has the same keys in Arabic and English', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
});
