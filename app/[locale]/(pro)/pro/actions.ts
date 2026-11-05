'use server';
/**
 * Counsellor workspace actions (task 07). Server actions are public
 * endpoints, so each one checks the counsellor role first; the database
 * functions check again and enforce the sharing rules. Events carry
 * categories only.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';
import { logEvents } from '@/lib/auth/events';
import type { ProEvent } from '@/lib/pro/events';
import { openRequestDetail, requireCounsellorAction } from '@/lib/pro/server';
import { outcomes, referralUpdates, resources, type RequestDetail } from '@/lib/pro/types';

const id = z.uuid();

type Result<T = undefined> = { ok: true; data: T } | { ok: false };

async function log(event: ProEvent) {
  const { supabase, userId } = await requireCounsellorAction();
  await logEvents(supabase, userId, [event]);
}

/** Opens a request. Writes access_log rows for each shared resource. */
export async function openRequest(requestId: string): Promise<Result<RequestDetail>> {
  const parsed = id.safeParse(requestId);
  if (!parsed.success) return { ok: false };
  const { supabase, userId } = await requireCounsellorAction();
  const detail = await openRequestDetail(supabase, parsed.data);
  if (!detail) return { ok: false };
  await logEvents(supabase, userId, [
    { name: 'counsellor_request_opened', props: { source: detail.source, urgency: detail.urgency } },
  ] satisfies ProEvent[]);
  return { ok: true, data: detail };
}

const accessInput = z.object({
  requestId: id,
  person: z.enum(['user', 'partner']),
  resource: z.enum(resources),
});

export async function requestAccess(
  input: z.input<typeof accessInput>,
): Promise<Result<'requested' | 'already_shared' | 'already_pending'>> {
  const parsed = accessInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { data, error } = await supabase.rpc('pro_request_access', {
    p_request_id: parsed.data.requestId,
    p_person: parsed.data.person,
    p_resource: parsed.data.resource,
  });
  if (error) return { ok: false };
  if (data === 'requested') await log({ name: 'access_requested', props: { resource: parsed.data.resource } });
  return { ok: true, data: data as 'requested' | 'already_shared' | 'already_pending' };
}

const noteInput = z.object({ requestId: id, body: z.string().max(20_000) });

export async function saveNote(input: z.input<typeof noteInput>): Promise<Result<string>> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { data, error } = await supabase.rpc('pro_save_note', {
    p_request_id: parsed.data.requestId,
    p_body: parsed.data.body,
  });
  if (error) return { ok: false };
  return { ok: true, data: data as string };
}

/** Starts the video session. Returns the meeting link (a demo room for now). */
export async function startSession(requestId: string): Promise<Result<string>> {
  const parsed = id.safeParse(requestId);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { data, error } = await supabase.rpc('pro_start_session', { p_request_id: parsed.data });
  if (error || typeof data !== 'string') return { ok: false };
  await log({ name: 'session_started' });
  refresh();
  return { ok: true, data };
}

/** Marks the session attended; the database logs session_attended per patient. */
export async function markAttended(requestId: string): Promise<Result> {
  const parsed = id.safeParse(requestId);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { error } = await supabase.rpc('pro_mark_attended', { p_request_id: parsed.data });
  if (error) return { ok: false };
  refresh();
  return { ok: true, data: undefined };
}

const referralInput = z.discriminatedUnion('step', [
  z.object({ requestId: id, step: z.literal('confirmatory_test') }),
  z.object({ requestId: id, step: z.literal('specialist'), serviceId: id }),
]);

/**
 * Creates a referral for everyone on the request. The database writes the
 * referrals rows, the patient notifications and referral_created events.
 */
export async function createReferral(input: z.input<typeof referralInput>): Promise<Result<number>> {
  const parsed = referralInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { data, error } = await supabase.rpc('pro_create_referral', {
    p_request_id: parsed.data.requestId,
    p_step: parsed.data.step,
    p_service_id: parsed.data.step === 'specialist' ? parsed.data.serviceId : null,
  });
  if (error) return { ok: false };
  refresh();
  return { ok: true, data: data as number };
}

const closeInput = z.object({
  requestId: id,
  outcome: z.enum(outcomes),
  followUpOn: z.iso.date().nullable(),
});

export async function closeRequest(input: z.input<typeof closeInput>): Promise<Result> {
  const parsed = closeInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { error } = await supabase.rpc('pro_close_request', {
    p_request_id: parsed.data.requestId,
    p_outcome: parsed.data.outcome,
    p_follow_up_on: parsed.data.followUpOn,
  });
  if (error) return { ok: false };
  await log({ name: 'request_closed', props: { outcome: parsed.data.outcome } });
  refresh();
  return { ok: true, data: undefined };
}

const referralStatusInput = z.object({ referralId: id, status: z.enum(referralUpdates) });

export async function updateReferralStatus(input: z.input<typeof referralStatusInput>): Promise<Result> {
  const parsed = referralStatusInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireCounsellorAction();
  const { data, error } = await supabase.rpc('pro_update_referral', {
    p_referral_id: parsed.data.referralId,
    p_status: parsed.data.status,
  });
  if (error || (data !== 'confirmatory_test' && data !== 'specialist')) return { ok: false };
  await log({ name: 'referral_status_changed', props: { step: data, status: parsed.data.status } });
  refresh();
  return { ok: true, data: undefined };
}
