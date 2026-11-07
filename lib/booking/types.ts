/**
 * Booking (task 15, section 4). Shared types and constants; pure, so client
 * components, server code and tests can all use them. Each list matches a
 * CHECK constraint in 20261111000000_directory_booking.sql.
 */
export const DEFAULT_TIME_ZONE = 'Asia/Dubai';

export const bookingStatuses = ['requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show'] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export const formats = ['video', 'in_person'] as const;
export type SessionFormat = (typeof formats)[number];

export const sessionLengths = [30, 45, 60] as const;
export type SessionLength = (typeof sessionLengths)[number];

/** What a patient can share before the session (design: Counsellor). */
export const shareItems = ['result', 'values_summary', 'family_map'] as const;
export type ShareItem = (typeof shareItems)[number];

export type Slot = { startsAt: string; endsAt: string; format: SessionFormat; minutes: number };

export type PatientBooking = {
  id: string;
  professionalId: string;
  professionalName: string | null;
  profession: string | null;
  startsAt: string;
  endsAt: string;
  format: SessionFormat;
  status: BookingStatus;
  meetingUrl: string | null;
  shared: ShareItem[];
  changeReason: string | null;
  changedBy: 'patient' | 'professional' | 'system' | null;
  familyInvited: boolean;
  partnerInvited: boolean;
  professionalAvailable: boolean;
};

export type ProBooking = {
  id: string;
  requestId: string | null;
  patientName: string;
  startsAt: string;
  endsAt: string;
  format: SessionFormat;
  status: BookingStatus;
  meetingUrl: string | null;
  meetLinkStatus: 'created' | 'manual' | 'fallback' | null;
  shared: ShareItem[];
  changeReason: string | null;
  changedBy: 'patient' | 'professional' | 'system' | null;
  familyInvited: boolean;
  partnerInvited: boolean;
};

/** Live bookings hold the slot; the rest are history. */
export const isLive = (status: BookingStatus) => status === 'requested' || status === 'confirmed';

/** "Join video call" opens 10 minutes before the start and stays until the end. */
export const JOIN_OPENS_MINUTES = 10;

export function canJoin(b: { status: BookingStatus; startsAt: string; endsAt: string; meetingUrl: string | null }, now = new Date()): boolean {
  if (b.status !== 'confirmed' || !b.meetingUrl) return false;
  const opens = Date.parse(b.startsAt) - JOIN_OPENS_MINUTES * 60_000;
  const closes = Date.parse(b.endsAt) + 30 * 60_000;
  return now.getTime() >= opens && now.getTime() <= closes;
}

export function sharedItems(choices: unknown): ShareItem[] {
  const items = (choices as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.filter((i): i is ShareItem => (shareItems as readonly string[]).includes(i)) : [];
}

/** Map database errors to messages the UI can show. */
export type BookingError = 'slot_unavailable' | 'too_late_to_change' | 'not_available' | 'invalid' | 'error';

export function bookingError(error: { code?: string; message?: string } | null): BookingError {
  if (!error) return 'error';
  if (error.message === 'slot_unavailable' || error.code === '23P01') return 'slot_unavailable';
  if (error.message === 'too_late_to_change') return 'too_late_to_change';
  if (error.code === '42501' || error.code === 'P0002') return 'not_available';
  if (error.code === '22023') return 'invalid';
  return 'error';
}
