import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCondition } from '@/lib/conditions/catalogue';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserPathInfo } from '@/lib/user/path';
import { relevantSpecialties, sortDirectory, type DirectoryEntry } from './sort';

const PHOTO_BUCKET = 'pro-photos';

type Row = {
  user_id: string;
  display_name: string;
  profession: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  years_experience: number | null;
  facility_name: string | null;
  bio: string | null;
  licence_authority: string | null;
  photo_path: string | null;
  gender: 'female' | 'male' | null;
  next_slot: string | null;
};

/**
 * Verified professionals who are accepting patients (the database decides,
 * guardrail 15), in the patient's order. Photos are private files: signed
 * links are made here, only for professionals the directory returned.
 */
export async function loadDirectory(supabase: SupabaseClient, ctx: { language: string; path: UserPathInfo }): Promise<DirectoryEntry[]> {
  const { data, error } = await supabase.rpc('professional_directory');
  if (error || !data) return [];
  const rows = data as Row[];

  const photos = new Map<string, string>();
  const paths = rows.map((r) => r.photo_path).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { data: signed } = await createAdminClient().storage.from(PHOTO_BUCKET).createSignedUrls(paths, 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) photos.set(s.path, s.signedUrl);
  }

  const list: DirectoryEntry[] = rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    profession: r.profession,
    specialties: r.specialties ?? [],
    languages: r.languages ?? [],
    yearsExperience: r.years_experience,
    facilityName: r.facility_name,
    bio: r.bio,
    licenceAuthority: r.licence_authority,
    photoUrl: r.photo_path ? (photos.get(r.photo_path) ?? null) : null,
    gender: r.gender,
    nextSlot: r.next_slot,
  }));
  return sortDirectory(list, { language: ctx.language, specialties: patientSpecialties(ctx.path, ctx.language) });
}

/** Specialties that match the patient's own findings or followed conditions (tasks 10, 11). */
export function patientSpecialties(path: UserPathInfo, language: string): string[] {
  const locale = language === 'ar' ? 'ar' : 'en';
  const ids = [
    ...path.findings.filter((f) => f.status !== 'no_variant').map((f) => f.conditionId),
    ...path.followed.map((f) => f.conditionId),
  ];
  const areas = ids.map((id) => getCondition(id, locale)?.area).filter((a): a is NonNullable<typeof a> => Boolean(a));
  return relevantSpecialties({ areas, hasCarrierFinding: path.findings.some((f) => f.status === 'carrier') });
}
