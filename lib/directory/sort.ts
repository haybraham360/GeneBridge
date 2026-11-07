/**
 * The professional directory's order and filters (task 15, section 2).
 * Pure, so it is unit-tested and runs on the server and in the browser.
 *
 * Order: professionals who speak the patient's language first, then those
 * whose specialties match the patient's findings or followed conditions,
 * then the soonest availability. Ties keep a stable alphabetical order.
 */
import type { Specialty } from '@/lib/kyc/types';

export type DirectoryEntry = {
  userId: string;
  displayName: string;
  profession: string | null;
  specialties: string[];
  languages: string[];
  yearsExperience: number | null;
  facilityName: string | null;
  bio: string | null;
  licenceAuthority: string | null;
  photoUrl: string | null;
  /** Only when the professional chose to show it. */
  gender: 'female' | 'male' | null;
  nextSlot: string | null;
};

/** Condition catalogue body areas → the specialties that cover them. */
const AREA_SPECIALTIES: Record<string, Specialty[]> = {
  blood: ['haemoglobin_disorders'],
  hearing_vision: ['hearing_loss'],
  metabolic: ['metabolic'],
  nerves_muscles: ['neurogenetics'],
  heart: ['cardiac_genetics'],
  cancer: ['cancer_genetics'],
};

/**
 * Specialties relevant to a patient: from the body areas of their findings
 * or followed conditions, plus carrier screening and reproductive genetics
 * for anyone with a carrier result.
 */
export function relevantSpecialties(input: { areas: string[]; hasCarrierFinding: boolean; pregnancy?: boolean }): Specialty[] {
  const set = new Set<Specialty>();
  for (const area of input.areas) for (const s of AREA_SPECIALTIES[area] ?? []) set.add(s);
  if (input.hasCarrierFinding) {
    set.add('carrier_screening');
    set.add('reproductive_genetics');
  }
  if (input.pregnancy) set.add('prenatal');
  return [...set];
}

export type SortContext = { language: string; specialties: string[] };

export function sortDirectory(list: DirectoryEntry[], ctx: SortContext): DirectoryEntry[] {
  const speaks = (e: DirectoryEntry) => (e.languages.includes(ctx.language) ? 0 : 1);
  const matches = (e: DirectoryEntry) => (e.specialties.some((s) => ctx.specialties.includes(s)) ? 0 : 1);
  const soon = (e: DirectoryEntry) => (e.nextSlot ? Date.parse(e.nextSlot) : Number.POSITIVE_INFINITY);
  return [...list].sort(
    (a, b) =>
      speaks(a) - speaks(b) ||
      matches(a) - matches(b) ||
      soon(a) - soon(b) ||
      a.displayName.localeCompare(b.displayName),
  );
}

export type DirectoryFilters = {
  language?: string | null;
  profession?: string | null;
  specialty?: string | null;
  thisWeek?: boolean;
  womenOnly?: boolean;
};

export function filterDirectory(list: DirectoryEntry[], f: DirectoryFilters, now = new Date()): DirectoryEntry[] {
  const weekEnd = now.getTime() + 7 * 86_400_000;
  return list.filter(
    (e) =>
      (!f.language || e.languages.includes(f.language)) &&
      (!f.profession || e.profession === f.profession) &&
      (!f.specialty || e.specialties.includes(f.specialty)) &&
      (!f.thisWeek || (e.nextSlot !== null && Date.parse(e.nextSlot) <= weekEnd)) &&
      // Only professionals who chose to show their gender can match.
      (!f.womenOnly || e.gender === 'female'),
  );
}

export function initialsOf(name: string): string {
  const words = name
    .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?';
}
