'use server';

import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { joinUrl, normaliseCode } from '@/lib/blind-match/code';
import { parseEligibility, parseState, type Eligibility, type MatchState } from '@/lib/blind-match/state';
import { createClient } from '@/lib/supabase/server';

/**
 * Blind Match (task 17). Every step goes through a database function that
 * checks who is asking; none of them ever returns anything from a result.
 */

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const label = (value: string | null) => (value ? value.trim().slice(0, 40) || null : null);

/** The site's own address for the QR link: the configured one first, then this request's host. */
async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export type StartResult =
  | { status: 'ok'; sessionId: string; code: string; link: string; qrSvg: string; expiresAt: string }
  | { status: Exclude<Eligibility, 'ok'> | 'error' };

export async function startBlindMatch(locale: string, myLabel: string | null): Promise<StartResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('blind_match_start', { p_label: label(myLabel) });
  if (error || !data) return { status: 'error' };
  const r = data as { status: string; session_id?: string; code?: string; expires_at?: string };
  if (r.status !== 'ok' || !r.session_id || !r.code || !r.expires_at) {
    const status = parseEligibility(r.status);
    return { status: status === 'ok' ? 'error' : status };
  }
  const link = joinUrl(await origin(), hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, r.code);
  const qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#141414', light: '#FFFFFF' } });
  return { status: 'ok', sessionId: r.session_id, code: r.code, link, qrSvg, expiresAt: r.expires_at };
}

export type JoinResult =
  | { status: 'ok'; sessionId: string }
  | { status: Exclude<Eligibility, 'ok'> | 'not_found' | 'rate_limited' | 'error' };

export async function joinBlindMatch(code: string, myLabel: string | null): Promise<JoinResult> {
  const clean = normaliseCode(code);
  if (!clean) return { status: 'not_found' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('blind_match_join', { p_code: clean, p_label: label(myLabel) });
  if (error || !data) return { status: 'error' };
  const r = data as { status: string; session_id?: string };
  if (r.status === 'ok' && r.session_id) return { status: 'ok', sessionId: r.session_id };
  if (r.status === 'not_found' || r.status === 'rate_limited') return { status: r.status };
  const status = parseEligibility(r.status);
  return { status: status === 'ok' ? 'error' : status };
}

export async function blindMatchState(sessionId: string): Promise<MatchState> {
  if (!uuid.test(sessionId)) return parseState(null);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('blind_match_state', { p_session: sessionId });
  return parseState(error ? null : data);
}

async function step(fn: 'blind_match_agree' | 'blind_match_cancel' | 'blind_match_reveal' | 'blind_match_counsellor', sessionId: string) {
  if (!uuid.test(sessionId)) return parseState(null);
  const supabase = await createClient();
  await supabase.rpc(fn, { p_session: sessionId });
  return blindMatchState(sessionId);
}

export async function agreeBlindMatch(sessionId: string) {
  return step('blind_match_agree', sessionId);
}

export async function cancelBlindMatch(sessionId: string) {
  return step('blind_match_cancel', sessionId);
}

export async function revealBlindMatch(sessionId: string) {
  return step('blind_match_reveal', sessionId);
}

/** Counted once per person when a "shared" answer leads to a counsellor (aggregate only). */
export async function noteBlindMatchCounsellor(sessionId: string) {
  await step('blind_match_counsellor', sessionId);
}
