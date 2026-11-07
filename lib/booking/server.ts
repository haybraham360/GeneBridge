import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sharedItems, type BookingStatus, type PatientBooking, type ProBooking, type SessionFormat, type Slot } from './types';

/** Free slots for one professional between two instants (computed in the database). */
export async function loadSlots(supabase: SupabaseClient, professionalId: string, from: Date, to: Date): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('free_slots', {
    p_professional: professionalId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !data) return [];
  return (data as { starts_at: string; ends_at: string; format: SessionFormat; session_minutes: number }[]).map((s) => ({
    startsAt: new Date(s.starts_at).toISOString(),
    endsAt: new Date(s.ends_at).toISOString(),
    format: s.format,
    minutes: s.session_minutes,
  }));
}

type PatientRow = {
  id: string;
  professional_id: string;
  professional_name: string | null;
  profession: string | null;
  starts_at: string;
  ends_at: string;
  format: SessionFormat;
  status: BookingStatus;
  meeting_url: string | null;
  share_choices: unknown;
  change_reason: string | null;
  changed_by: PatientBooking['changedBy'];
  family_member_invited: boolean;
  partner_invited: boolean;
  professional_available: boolean;
};

export async function loadMyBookings(supabase: SupabaseClient): Promise<PatientBooking[]> {
  const { data, error } = await supabase.rpc('my_bookings');
  if (error || !data) return [];
  return (data as PatientRow[]).map((r) => ({
    id: r.id,
    professionalId: r.professional_id,
    professionalName: r.professional_name,
    profession: r.profession,
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    format: r.format,
    status: r.status,
    meetingUrl: r.meeting_url,
    shared: sharedItems(r.share_choices),
    changeReason: r.change_reason,
    changedBy: r.changed_by,
    familyInvited: r.family_member_invited,
    partnerInvited: r.partner_invited,
    professionalAvailable: r.professional_available,
  }));
}

/** The patient's next live session (requested or confirmed, not long over), for Home. */
export async function loadNextBooking(supabase: SupabaseClient): Promise<PatientBooking | null> {
  const since = Date.now() - 30 * 60_000;
  return (
    (await loadMyBookings(supabase))
      .filter((b) => (b.status === 'requested' || b.status === 'confirmed') && Date.parse(b.endsAt) > since)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
  );
}

type ProRow = {
  id: string;
  request_id: string | null;
  patient_name: string;
  starts_at: string;
  ends_at: string;
  format: SessionFormat;
  status: BookingStatus;
  meeting_url: string | null;
  meet_link_status: ProBooking['meetLinkStatus'];
  share_choices: unknown;
  change_reason: string | null;
  changed_by: ProBooking['changedBy'];
  family_member_invited: boolean;
  partner_invited: boolean;
};

export async function loadProBookings(supabase: SupabaseClient, from: Date, to: Date): Promise<ProBooking[]> {
  const { data, error } = await supabase.rpc('pro_bookings', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error || !data) return [];
  return (data as ProRow[]).map((r) => ({
    id: r.id,
    requestId: r.request_id,
    patientName: r.patient_name,
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    format: r.format,
    status: r.status,
    meetingUrl: r.meeting_url,
    meetLinkStatus: r.meet_link_status,
    shared: sharedItems(r.share_choices),
    changeReason: r.change_reason,
    changedBy: r.changed_by,
    familyInvited: r.family_member_invited,
    partnerInvited: r.partner_invited,
  }));
}

export type RequestOffer = {
  offerId: string;
  requestId: string;
  reason: string;
  professionalId: string;
  displayName: string;
  profession: string | null;
  languages: string[];
  licenceAuthority: string | null;
};

export async function loadMyOffers(supabase: SupabaseClient): Promise<RequestOffer[]> {
  const { data, error } = await supabase.rpc('my_request_offers');
  if (error || !data) return [];
  type R = { offer_id: string; request_id: string; reason: string; professional_id: string; display_name: string; profession: string | null; languages: string[] | null; licence_authority: string | null };
  return (data as R[]).map((r) => ({
    offerId: r.offer_id,
    requestId: r.request_id,
    reason: r.reason,
    professionalId: r.professional_id,
    displayName: r.display_name,
    profession: r.profession,
    languages: r.languages ?? [],
    licenceAuthority: r.licence_authority,
  }));
}

export type OpenRequest = { id: string; reason: string; urgency: 'standard' | 'priority'; language: string; createdAt: string; offered: boolean };

export async function loadOpenRequests(supabase: SupabaseClient): Promise<OpenRequest[]> {
  const { data, error } = await supabase.rpc('pro_open_requests');
  if (error || !data) return [];
  type R = { id: string; reason: string; urgency: OpenRequest['urgency']; language: string; created_at: string; offered: boolean };
  return (data as R[]).map((r) => ({ id: r.id, reason: r.reason, urgency: r.urgency, language: r.language, createdAt: r.created_at, offered: r.offered }));
}

export async function changeCutoffHours(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.rpc('booking_change_cutoff_hours');
  return typeof data === 'number' ? data : 24;
}
