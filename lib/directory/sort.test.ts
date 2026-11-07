import { describe, expect, it } from 'vitest';
import { filterDirectory, initialsOf, relevantSpecialties, sortDirectory, type DirectoryEntry } from './sort';

const entry = (over: Partial<DirectoryEntry>): DirectoryEntry => ({
  userId: over.displayName ?? 'x',
  displayName: 'Dr. X',
  profession: 'genetic_counsellor',
  specialties: [],
  languages: ['en'],
  yearsExperience: null,
  facilityName: null,
  bio: null,
  licenceAuthority: 'doh_abu_dhabi',
  photoUrl: null,
  gender: null,
  nextSlot: null,
  ...over,
});

describe('sortDirectory', () => {
  const now = Date.parse('2026-11-07T08:00:00Z');
  const list = [
    entry({ displayName: 'Dr. English Soon', languages: ['en'], nextSlot: new Date(now + 3600_000).toISOString() }),
    entry({ displayName: 'Dr. Arabic Later', languages: ['ar', 'en'], nextSlot: new Date(now + 5 * 86_400_000).toISOString() }),
    entry({ displayName: 'Dr. Arabic Match', languages: ['ar'], specialties: ['haemoglobin_disorders'], nextSlot: new Date(now + 9 * 86_400_000).toISOString() }),
    entry({ displayName: 'Dr. Arabic None', languages: ['ar'] }),
  ];

  it('puts language first, then specialty match, then soonest availability', () => {
    const sorted = sortDirectory(list, { language: 'ar', specialties: ['haemoglobin_disorders'] });
    expect(sorted.map((e) => e.displayName)).toEqual([
      'Dr. Arabic Match',
      'Dr. Arabic Later',
      'Dr. Arabic None',
      'Dr. English Soon',
    ]);
  });

  it('falls back to soonest availability for an English speaker without findings', () => {
    const sorted = sortDirectory(list, { language: 'en', specialties: [] });
    expect(sorted[0].displayName).toBe('Dr. English Soon');
    expect(sorted[1].displayName).toBe('Dr. Arabic Later');
  });
});

describe('filterDirectory', () => {
  const now = new Date('2026-11-07T08:00:00Z');
  const list = [
    entry({ displayName: 'A', gender: 'female', languages: ['ar'], nextSlot: '2026-11-09T05:00:00Z' }),
    entry({ displayName: 'B', gender: null, languages: ['en'], profession: 'nurse', nextSlot: '2026-11-30T05:00:00Z' }),
  ];
  it('women only matches only professionals who show their gender', () => {
    expect(filterDirectory(list, { womenOnly: true }, now).map((e) => e.displayName)).toEqual(['A']);
  });
  it('filters by language, profession and this week', () => {
    expect(filterDirectory(list, { language: 'en' }, now).map((e) => e.displayName)).toEqual(['B']);
    expect(filterDirectory(list, { profession: 'nurse' }, now).map((e) => e.displayName)).toEqual(['B']);
    expect(filterDirectory(list, { thisWeek: true }, now).map((e) => e.displayName)).toEqual(['A']);
  });
});

describe('relevantSpecialties and initials', () => {
  it('maps findings to specialties', () => {
    expect(relevantSpecialties({ areas: ['blood', 'hearing_vision'], hasCarrierFinding: true })).toEqual([
      'haemoglobin_disorders',
      'hearing_loss',
      'carrier_screening',
      'reproductive_genetics',
    ]);
  });
  it('makes initials without titles', () => {
    expect(initialsOf('Dr. Amaka Okoro')).toBe('AO');
    expect(initialsOf('Layla')).toBe('L');
  });
});
