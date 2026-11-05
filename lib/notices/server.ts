import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';
import {
  isNoticeCode,
  isNoticeCondition,
  isNoticeLocale,
  type NoticeStatus,
  type NoticeView,
} from './types';

/**
 * Data access for the public notice pages. Uses the anon key with no session
 * and no cookies: the relative is never signed in, and nothing here can set
 * or read a cookie. Everything goes through the task 08 database functions,
 * which never return anything about the sender.
 */
function publicClient() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

const INVALID: NoticeView = { status: 'invalid', locale: null, conditionId: null, signedName: null };

const statuses = new Set<NoticeStatus>(['valid', 'invalid', 'expired', 'stopped']);

/**
 * One notice. Always calls the database, even for a malformed code, so an
 * invalid link takes about as long as a valid one.
 */
export async function loadNotice(code: string, { markOpen = true } = {}): Promise<NoticeView> {
  const { data, error } = await publicClient().rpc('family_notice_view', {
    p_code: isNoticeCode(code) ? code : '',
    p_mark_open: markOpen,
  });
  if (error || !data) return INVALID;
  const row = data as { status?: unknown; locale?: unknown; condition_id?: unknown; signed_name?: unknown };
  const status = statuses.has(row.status as NoticeStatus) ? (row.status as NoticeStatus) : 'invalid';
  return {
    status,
    locale: isNoticeLocale(row.locale) ? row.locale : null,
    conditionId: status === 'valid' && isNoticeCondition(row.condition_id) ? row.condition_id : null,
    signedName: status === 'valid' && typeof row.signed_name === 'string' ? row.signed_name : null,
  };
}

export async function stopNotice(code: string): Promise<'stopped' | 'invalid' | 'error'> {
  const { data, error } = await publicClient().rpc('family_notice_stop', { p_code: code });
  if (error) return 'error';
  return data === 'stopped' ? 'stopped' : 'invalid';
}

export async function undoStopNotice(code: string): Promise<'valid' | 'expired' | 'invalid' | 'error'> {
  const { data, error } = await publicClient().rpc('family_notice_undo_stop', { p_code: code });
  if (error) return 'error';
  return data === 'valid' || data === 'expired' ? data : 'invalid';
}

export const reportReasons = ['not_family', 'harassment', 'unwanted', 'other'] as const;
export type ReportReason = (typeof reportReasons)[number];

export async function reportNotice(code: string, reason: ReportReason): Promise<boolean> {
  const { error } = await publicClient().rpc('family_notice_report', { p_code: code, p_reason: reason });
  return !error;
}

/** Aggregate click counts only. Never blocks the page. */
export async function logNoticeEvent(name: 'notice_testing_clicked' | 'notice_question_clicked') {
  const { error } = await publicClient().rpc('notice_log_event', { p_name: name });
  if (error) console.warn('notice event failed', name);
}

export type TestingService = {
  kind: 'screening' | 'genetic_counselling' | 'confirmatory_testing';
  name: string;
  area: string | null;
  languages: string[];
};

export async function testingServices(): Promise<TestingService[]> {
  const { data, error } = await publicClient().rpc('notice_testing_services');
  if (error || !Array.isArray(data)) return [];
  return data as TestingService[];
}

/** Public Ask GeneBridge: global hourly cap, no per-person data. */
export async function takePublicAskSlot(): Promise<boolean> {
  const { data, error } = await publicClient().rpc('public_ask_take', { p_limit: 300 });
  return !error && data === true;
}
