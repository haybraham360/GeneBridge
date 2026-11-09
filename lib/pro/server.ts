import 'server-only';
/**
 * Data access for the counsellor workspace, as the signed-in user. Every
 * call goes through a `pro_*` database function that checks the counsellor
 * role, returns only what patients shared, and writes access_log for each
 * shared resource it returns.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { entryForConditionCode } from '@/lib/assistant/library';
import { createClient } from '@/lib/supabase/server';
import type {
  CounsellorMe,
  DetailReferral,
  FlagReason,
  Outcome,
  PersonDetail,
  ReferralRow,
  RequestDetail,
  RequestReason,
  RequestRow,
  RequestSource,
  RequestStatus,
  Resource,
  Service,
  ServiceKind,
  SessionFormat,
  SharedResult,
  Urgency,
  ValuesRow,
} from './types';

/** Is the signed-in user a counsellor? */
export async function isCounsellor(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('pro_is_counsellor');
  return !error && data === true;
}

/**
 * For pages and layouts: the counsellor, or a 404 for everyone else (the
 * route doesn't announce itself). The proxy checks first; this checks again.
 */
export async function requireCounsellorPage(): Promise<{ supabase: SupabaseClient; me: CounsellorMe }> {
  const supabase = await createClient();
  const me = await loadMe(supabase);
  if (!me) notFound();
  return { supabase, me };
}

export class NotCounsellorError extends Error {
  constructor() {
    super('Not found');
  }
}

/**
 * For server actions: the counsellor and their user id, or an error. Actions
 * are public endpoints, so this runs on every call (the database functions
 * check again).
 */
export async function requireCounsellorAction(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || !(await isCounsellor(supabase))) throw new NotCounsellorError();
  return { supabase, userId };
}

export async function loadMe(supabase: SupabaseClient): Promise<CounsellorMe | null> {
  const { data, error } = await supabase.rpc('pro_me');
  const row = (data as { counsellor_id: string; name: string; facility_name: string }[] | null)?.[0];
  if (error || !row) return null;
  return { counsellorId: row.counsellor_id, name: row.name, facilityName: row.facility_name };
}

type RequestRpcRow = {
  id: string;
  patient_key: string;
  source: RequestSource;
  reason: RequestReason;
  urgency: Urgency;
  status: RequestStatus;
  outcome: Outcome | null;
  created_at: string;
  closed_at: string | null;
  is_couple: boolean;
  assigned_to_me: boolean;
  user_first_name: string | null;
  user_initial: string;
  partner_first_name: string | null;
  partner_initial: string | null;
  starts_at: string | null;
  format: SessionFormat | null;
  attended_at: string | null;
  shared: Resource[] | null;
  flag_reason: FlagReason | null;
};

export async function loadRequests(supabase: SupabaseClient): Promise<RequestRow[]> {
  const { data, error } = await supabase.rpc('pro_requests');
  if (error) throw new Error(`pro_requests: ${error.message}`);
  return ((data ?? []) as RequestRpcRow[]).map((r) => ({
    id: r.id,
    patientKey: r.patient_key,
    source: r.source,
    reason: r.reason,
    urgency: r.urgency,
    status: r.status,
    outcome: r.outcome,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    isCouple: r.is_couple,
    assignedToMe: r.assigned_to_me,
    user: { firstName: r.user_first_name, initial: r.user_initial },
    partner: r.is_couple ? { firstName: r.partner_first_name, initial: r.partner_initial ?? '·' } : null,
    booking:
      r.starts_at && r.format ? { startsAt: r.starts_at, format: r.format, attendedAt: r.attended_at } : null,
    shared: [...new Set(r.shared ?? [])],
    flagReason: r.flag_reason,
  }));
}

type DetailJson = {
  id: string;
  source: RequestSource;
  reason: RequestReason;
  urgency: Urgency;
  status: RequestStatus;
  created_at: string;
  is_couple: boolean;
  booking: { starts_at: string; format: SessionFormat; meeting_url: string | null; attended_at: string | null } | null;
  people: {
    role: 'user' | 'partner';
    first_name: string | null;
    initial: string;
    locale: string | null;
    shared_any: boolean;
    result: {
      level: SharedResult['level'];
      condition_code: string;
      status: SharedResult['status'];
      genotype: string | null;
      flagged: boolean;
      flag_reason: FlagReason | null;
      reported_at: string | null;
      understood: number;
      centre: string | null;
    } | null;
    values_shared: boolean;
    questions: string[] | null;
    ai_summary: string | null;
    family_map_shared: boolean;
    missing: Resource[];
    pending: Resource[];
  }[];
  values: { question_id: ValuesRow['questionId']; user_band: ValuesRow['userBand']; partner_band: ValuesRow['partnerBand']; agreement: ValuesRow['agreement'] }[];
  request_summary: string | null;
  note: { body: string; updated_at: string } | null;
  referrals: { id: string; step: DetailReferral['step']; status: DetailReferral['status']; role: 'user' | 'partner'; service_name: string | null }[];
};

/**
 * Opens one request. This is a read of patients' shared data, so it writes
 * access_log rows: call it only when the counsellor chooses to open it.
 */
export async function openRequestDetail(supabase: SupabaseClient, requestId: string): Promise<RequestDetail | null> {
  const { data, error } = await supabase.rpc('pro_request_detail', { p_request_id: requestId });
  if (error || !data) return null;
  const d = data as DetailJson;
  const locale = (await getLocale()) === 'ar' ? 'ar' : 'en';
  const namesFor = (code: string) => {
    const entry = entryForConditionCode(code, locale);
    return entry ? { name: entry.disease_label ?? entry.title, carrier: entry.carrier_label ?? entry.title } : null;
  };
  const people: PersonDetail[] = d.people.map((p) => ({
    role: p.role,
    label: { firstName: p.first_name, initial: p.initial },
    locale: p.locale,
    sharedAny: p.shared_any,
    result: p.result
      ? {
          level: p.result.level,
          conditionCode: p.result.condition_code,
          conditionNames: namesFor(p.result.condition_code),
          status: p.result.status,
          genotype: p.result.genotype,
          flagged: p.result.flagged,
          flagReason: p.result.flag_reason,
          reportedAt: p.result.reported_at,
          understood: p.result.understood,
          centre: p.result.centre,
        }
      : null,
    valuesShared: p.values_shared,
    questions: p.questions,
    aiSummary: p.ai_summary,
    familyMapShared: p.family_map_shared,
    missing: p.missing ?? [],
    pending: p.pending ?? [],
  }));
  return {
    id: d.id,
    source: d.source,
    reason: d.reason,
    urgency: d.urgency,
    status: d.status,
    createdAt: d.created_at,
    isCouple: d.is_couple,
    booking: d.booking
      ? {
          startsAt: d.booking.starts_at,
          format: d.booking.format,
          meetingUrl: d.booking.meeting_url,
          attendedAt: d.booking.attended_at,
        }
      : null,
    people,
    values: d.values.map((v) => ({
      questionId: v.question_id,
      userBand: v.user_band,
      partnerBand: v.partner_band,
      agreement: v.agreement,
    })),
    requestSummary: d.request_summary,
    note: d.note ? { body: d.note.body, updatedAt: d.note.updated_at } : null,
    referrals: d.referrals.map((r) => ({
      id: r.id,
      step: r.step,
      status: r.status,
      role: r.role,
      serviceName: r.service_name,
    })),
  };
}

export async function loadReferrals(supabase: SupabaseClient): Promise<ReferralRow[]> {
  const { data, error } = await supabase.rpc('pro_referrals');
  if (error) throw new Error(`pro_referrals: ${error.message}`);
  type Row = {
    id: string;
    request_id: string | null;
    step: ReferralRow['step'];
    status: ReferralRow['status'];
    service_kind: ServiceKind | null;
    service_name: string | null;
    created_at: string;
    updated_at: string;
    first_name: string | null;
    initial: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    requestId: r.request_id,
    step: r.step,
    status: r.status,
    serviceKind: r.service_kind,
    serviceName: r.service_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    label: { firstName: r.first_name, initial: r.initial },
  }));
}

/**
 * Specialist services for the referral picker. An allow-list, because the
 * services table also holds patient-directory kinds (screening, counselling).
 */
const SPECIALIST_KINDS: ServiceKind[] = ['haematology', 'ivf_embryo_testing'];

export async function loadSpecialistServices(supabase: SupabaseClient): Promise<Service[]> {
  const { data } = await supabase
    .from('services')
    .select('id, kind, name')
    .in('kind', SPECIALIST_KINDS)
    .order('sort');
  return (data ?? []) as Service[];
}

export type NoteRow = { requestId: string; body: string; updatedAt: string };

/** The caller's own notes, newest first (RLS: counsellor and facility). */
export async function loadMyNotes(supabase: SupabaseClient, counsellorId: string): Promise<NoteRow[]> {
  const { data } = await supabase
    .from('session_notes')
    .select('request_id, body, updated_at')
    .eq('counsellor_id', counsellorId)
    .order('updated_at', { ascending: false })
    .limit(200);
  return ((data ?? []) as { request_id: string; body: string; updated_at: string }[]).map((n) => ({
    requestId: n.request_id,
    body: n.body,
    updatedAt: n.updated_at,
  }));
}
