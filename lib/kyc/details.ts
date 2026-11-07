/**
 * Validates a professional's own details (onboarding step 2 and the Profile
 * page). Pure, so it is unit-tested and shared by client and server; the
 * server always re-validates.
 */
import {
  BIO_MAX,
  FACILITY_MAX,
  isProfession,
  isSpecialty,
  isSpokenLanguage,
  NAME_MAX,
  type Profession,
  type Specialty,
  type SpokenLanguage,
} from './types';

export type DetailsInput = {
  displayName?: unknown;
  profession?: unknown;
  specialties?: unknown;
  languages?: unknown;
  yearsExperience?: unknown;
  facilityName?: unknown;
  bio?: unknown;
};

export type Details = {
  displayName: string;
  profession: Profession;
  specialties: Specialty[];
  languages: SpokenLanguage[];
  yearsExperience: number | null;
  facilityName: string | null;
  bio: string | null;
};

export type DetailsField = 'displayName' | 'profession' | 'languages' | 'yearsExperience' | 'facilityName' | 'bio';

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function parseDetails(input: DetailsInput): { ok: true; value: Details } | { ok: false; errors: DetailsField[] } {
  const errors: DetailsField[] = [];

  const displayName = text(input.displayName);
  if (displayName.length < 2 || displayName.length > NAME_MAX) errors.push('displayName');

  const profession = isProfession(input.profession) ? input.profession : null;
  if (!profession) errors.push('profession');

  const specialties = Array.isArray(input.specialties) ? [...new Set(input.specialties.filter(isSpecialty))] : [];

  const languages = Array.isArray(input.languages) ? [...new Set(input.languages.filter(isSpokenLanguage))] : [];
  if (languages.length === 0) errors.push('languages');

  let yearsExperience: number | null = null;
  const rawYears = typeof input.yearsExperience === 'string' ? input.yearsExperience.trim() : input.yearsExperience;
  if (rawYears !== '' && rawYears !== null && rawYears !== undefined) {
    const n = Number(rawYears);
    if (!Number.isInteger(n) || n < 0 || n > 70) errors.push('yearsExperience');
    else yearsExperience = n;
  }

  const facility = text(input.facilityName);
  if (facility.length > FACILITY_MAX) errors.push('facilityName');

  // The bio keeps its line breaks.
  const bio = typeof input.bio === 'string' ? input.bio.trim() : '';
  if (bio.length > BIO_MAX) errors.push('bio');

  if (errors.length || !profession) return { ok: false, errors };
  return {
    ok: true,
    value: {
      displayName,
      profession,
      specialties,
      languages,
      yearsExperience,
      facilityName: facility || null,
      bio: bio || null,
    },
  };
}

/** Column names for professional_profiles. */
export function detailsColumns(d: Details) {
  return {
    display_name: d.displayName,
    profession: d.profession,
    specialties: d.specialties,
    languages: d.languages,
    years_experience: d.yearsExperience,
    facility_name: d.facilityName,
    bio: d.bio,
  };
}
