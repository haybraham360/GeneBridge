import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderIndex } from '@/scripts/gen-library-index';
import { conditionAreas } from '@/lib/conditions/search';
import { allEntries, getEntry } from './library';

const conditions = (locale: 'en' | 'ar') => allEntries(locale).filter((e) => e.kind === 'condition');
const patterns = ['autosomal_recessive', 'autosomal_dominant', 'x_linked', 'complex'];
const required = [
  'summary',
  'inheritance_plain',
  'carrier_meaning',
  'disease_meaning',
  'screening',
  'card_summary',
  'carrier_label',
  'disease_label',
  'carrier_short',
  'disease_short',
  'care',
] as const;

describe('content library', () => {
  it('libraryIndex.ts lists every file (run `npm run library:index`)', () => {
    const current = readFileSync(join(__dirname, 'libraryIndex.ts'), 'utf8');
    expect(current).toBe(renderIndex());
  });

  it('has every entry in both languages', () => {
    const en = allEntries('en').map((e) => e.id).sort();
    const ar = allEntries('ar').map((e) => e.id).sort();
    expect(ar).toEqual(en);
  });

  describe.each(conditions('en').map((e) => [e.id]))('%s', (id) => {
    const en = getEntry(id, 'en')!;
    const ar = getEntry(id, 'ar')!;

    it('has a valid id, pattern and area that match across languages', () => {
      // family_member_conditions.condition_id allows 2 to 40 characters.
      expect(id).toMatch(/^[a-z0-9_]{2,40}$/);
      expect(en.locale).toBe('en');
      expect(ar.locale).toBe('ar');
      expect(patterns).toContain(en.inheritance);
      expect(ar.inheritance).toBe(en.inheritance);
      expect(conditionAreas).toContain(en.area);
      expect(ar.area).toBe(en.area);
      expect(ar.gene).toBe(en.gene);
      expect(ar.always_escalate ?? false).toBe(en.always_escalate ?? false);
    });

    it('has every field the guide, results and notice pages show', () => {
      for (const entry of [en, ar]) {
        for (const field of required) expect(entry[field], `${entry.locale}.${field}`).toBeTruthy();
        expect(entry.aliases.length).toBeGreaterThan(0);
        expect(entry.synonyms?.length ?? 0).toBeGreaterThan(0);
        expect(entry.suggested_questions).toHaveLength(3);
        expect(entry.counsellor_questions?.length ?? 0).toBeGreaterThan(0);
        expect(entry.sources.length).toBeGreaterThan(0);
        for (const s of entry.sources) expect(s.url).toMatch(/^https:\/\//);
      }
    });

    it('is written in Arabic for the Arabic entry', () => {
      expect(ar.title).toMatch(/\p{Script=Arabic}/u);
      expect(ar.summary).toMatch(/\p{Script=Arabic}/u);
    });

    it('is never directive (guardrail 1)', () => {
      for (const entry of [en, ar]) {
        const text = JSON.stringify(entry).toLowerCase();
        expect(text).not.toMatch(/\brecommended\b|best option|you should/);
      }
    });
  });
});
