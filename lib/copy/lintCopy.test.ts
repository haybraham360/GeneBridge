import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowed, lintCopy, lintCopyFile } from './lintCopy';

describe('copy lint (guardrail 1)', () => {
  it('flags directive wording in English and Arabic', () => {
    const problems = lintCopyFile('messages/en/options.json', {
      a: 'IVF with PGT is the recommended route.',
      b: { c: 'This is the best option for most couples.' },
      d: ['You should talk to your partner first.'],
      e: 'ننصحكم بالخيار الأفضل.',
      f: 'هذا الخيار موصى به.',
    });
    expect(problems.map((p) => p.key)).toEqual(['a', 'b.c', 'd.0', 'e', 'f']);
  });

  it('allows neutral wording', () => {
    expect(
      lintCopyFile('messages/en/options.json', {
        a: 'This is information, not a recommendation. Every option is valid.',
        b: 'A genetic counsellor should talk this through with you.',
        c: 'الخيارات ليست مرتبة حسب الأفضلية.',
      }),
    ).toEqual([]);
  });

  it('skips allowlisted strings only', () => {
    const [key] = Object.keys(allowed);
    const [file, path] = key.split('#');
    expect(lintCopyFile(file, { [path]: 'recommended' })).toEqual([]);
    expect(lintCopyFile('messages/en/other.json', { [path]: 'recommended' })).toHaveLength(1);
  });

  it('passes on the real copy', () => {
    expect(lintCopy(join(__dirname, '../..'))).toEqual({ problems: [], staleAllowed: [] });
  });
});
