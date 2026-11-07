import 'server-only';
/**
 * Data access for task 14, as the signed-in user (RLS applies). Professionals
 * read their own profile and submissions; admins go through the kyc_admin_*
 * database functions, which check the role themselves.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  bannerState,
  isVerificationStatus,
  type Authority,
  type BannerState,
  type Precheck,
  type Profession,
  type SubmissionStatus,
  type VerificationStatus,
} from './types';

export type ProfessionalProfile = {
  userId: string;
  displayName: string;
  profession: Profession | null;
  specialties: string[];
  languages: string[];
  yearsExperience: number | null;
  facilityName: string | null;
  bio: string | null;
  photoPath: string | null;
  notifyEmail: boolean;
  status: VerificationStatus;
  licenceNumber: string | null;
  licenceAuthority: Authority | null;
  licenceExpiry: string | null;
  acceptingPatients: boolean;
  welcomeSeenAt: string | null;
};

export type OwnSubmission = {
  id: string;
  status: SubmissionStatus;
  entered_licence_number: string;
  entered_authority: Authority;
  entered_authority_other: string | null;
  entered_expiry: string;
  reviewer_notes: string | null;
  decided_at: string | null;
  created_at: string;
};

export type ProContext = {
  supabase: SupabaseClient;
  userId: string;
  profile: ProfessionalProfile;
  latest: OwnSubmission | null;
  banner: BannerState;
  verified: boolean;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  profession: Profession | null;
  specialties: string[];
  languages: string[];
  years_experience: number | null;
  facility_name: string | null;
  bio: string | null;
  photo_path: string | null;
  notify_email: boolean;
  verification_status: string;
  licence_number: string | null;
  licence_authority: Authority | null;
  licence_expiry: string | null;
  accepting_patients: boolean;
  welcome_seen_at: string | null;
};

const PROFILE_COLUMNS =
  'user_id, display_name, profession, specialties, languages, years_experience, facility_name, bio, photo_path, notify_email, verification_status, licence_number, licence_authority, licence_expiry, accepting_patients, welcome_seen_at';

export const SUBMISSION_COLUMNS =
  'id, status, entered_licence_number, entered_authority, entered_authority_other, entered_expiry, reviewer_notes, decided_at, created_at';

function toProfile(row: ProfileRow): ProfessionalProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    profession: row.profession,
    specialties: row.specialties ?? [],
    languages: row.languages ?? [],
    yearsExperience: row.years_experience,
    facilityName: row.facility_name,
    bio: row.bio,
    photoPath: row.photo_path,
    notifyEmail: row.notify_email,
    status: isVerificationStatus(row.verification_status) ? row.verification_status : 'unverified',
    licenceNumber: row.licence_number,
    licenceAuthority: row.licence_authority,
    licenceExpiry: row.licence_expiry,
    acceptingPatients: row.accepting_patients,
    welcomeSeenAt: row.welcome_seen_at,
  };
}

export async function loadProfessional(supabase: SupabaseClient, userId: string): Promise<ProfessionalProfile | null> {
  const { data } = await supabase.from('professional_profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle();
  return data ? toProfile(data as ProfileRow) : null;
}

export async function loadLatestSubmission(supabase: SupabaseClient, userId: string): Promise<OwnSubmission | null> {
  const { data } = await supabase
    .from('verification_submissions')
    .select(SUBMISSION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OwnSubmission | null) ?? null;
}

/** The professional's context, or null for anyone else. */
export async function loadProContext(supabase: SupabaseClient): Promise<ProContext | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const [profile, latest] = await Promise.all([loadProfessional(supabase, userId), loadLatestSubmission(supabase, userId)]);
  if (!profile) return null;
  const banner = bannerState(profile.status, latest);
  const verified =
    profile.status === 'verified' && (!profile.licenceExpiry || profile.licenceExpiry >= new Date().toISOString().slice(0, 10));
  return { supabase, userId, profile, latest, banner, verified };
}

/** For /pro pages and layouts: any professional, or a 404. */
export async function requireProfessionalPage(): Promise<ProContext> {
  const ctx = await loadProContext(await createClient());
  if (!ctx) notFound();
  return ctx;
}

export class NotProfessionalError extends Error {
  constructor() {
    super('Not found');
  }
}

/** For server actions: any professional, or an error. */
export async function requireProfessionalAction(): Promise<ProContext> {
  const ctx = await loadProContext(await createClient());
  if (!ctx) throw new NotProfessionalError();
  return ctx;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('kyc_is_admin');
  return !error && data === true;
}

export async function requireAdminPage(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || !(await isAdmin(supabase))) notFound();
  return { supabase, userId };
}

export class NotAdminError extends Error {
  constructor() {
    super('Not found');
  }
}

export async function requireAdminAction(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || !(await isAdmin(supabase))) throw new NotAdminError();
  return { supabase, userId };
}

export type QueueRow = {
  id: string;
  user_id: string;
  display_name: string;
  profession: Profession | null;
  entered_authority: Authority;
  status: SubmissionStatus;
  precheck_status: 'pending' | 'completed' | 'unavailable';
  precheck_counts: { passed: number; failed: number; unclear: number };
  created_at: string;
};

export async function loadQueue(supabase: SupabaseClient): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc('kyc_admin_queue');
  if (error) throw new Error(`kyc_admin_queue: ${error.message}`);
  return (data as QueueRow[]) ?? [];
}

export type VerifiedRow = {
  user_id: string;
  display_name: string;
  profession: Profession | null;
  verification_status: VerificationStatus;
  licence_number: string | null;
  licence_authority: Authority | null;
  licence_expiry: string | null;
  accepting_patients: boolean;
  verified_at: string | null;
};

export async function loadProfessionals(supabase: SupabaseClient): Promise<VerifiedRow[]> {
  const { data, error } = await supabase.rpc('kyc_admin_professionals');
  if (error) throw new Error(`kyc_admin_professionals: ${error.message}`);
  return (data as VerifiedRow[]) ?? [];
}

export type FlaggedBooking = { id: string; professional_name: string; starts_at: string; flag_reason: 'suspended' | 'expired'; flagged_at: string };

export async function loadFlaggedBookings(supabase: SupabaseClient): Promise<FlaggedBooking[]> {
  const { data, error } = await supabase.rpc('kyc_admin_flagged_bookings');
  if (error) throw new Error(`kyc_admin_flagged_bookings: ${error.message}`);
  return (data as FlaggedBooking[]) ?? [];
}

export type AdminSubmission = {
  id: string;
  user_id: string;
  status: SubmissionStatus;
  created_at: string;
  decided_at: string | null;
  reviewer_notes: string | null;
  entered_licence_number: string;
  entered_authority: Authority;
  entered_authority_other: string | null;
  entered_expiry: string;
  id_document_paths: string[];
  licence_document_paths: string[];
  selfie_path: string | null;
  ai_precheck: Precheck | null;
  professional: {
    display_name: string;
    profession: Profession | null;
    specialties: string[];
    languages: string[];
    years_experience: number | null;
    facility_name: string | null;
    verification_status: VerificationStatus;
  };
};

/** Opening a submission moves it to in_review and writes a "viewed" audit row. */
export async function openSubmission(supabase: SupabaseClient, id: string): Promise<AdminSubmission | null> {
  const { data, error } = await supabase.rpc('kyc_admin_submission', { p_id: id });
  if (error) return null;
  return data as AdminSubmission;
}
