import 'server-only';
/**
 * Counsellor copilot data access (task 16). Every call runs as the signed-in
 * counsellor through a database function that checks they are verified and
 * can see the request.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiEnabled } from '@/lib/assistant/claude';
import { referralSteps, type ReferralStep } from '@/lib/pro/types';
import { isSummaryProblem } from './check';
import type { CopilotContext, CopilotLocale, PatientSummary } from './types';

type ContextJson = {
  is_couple: boolean;
  session_ended_at: string | null;
  people: {
    role: 'user' | 'partner';
    first_name: string | null;
    initial: string;
    locale: CopilotLocale;
    referrals: string[];
    summary: {
      status: 'draft' | 'approved';
      engine: 'ai' | 'manual';
      body: string;
      problems: string[];
      updated_at: string;
      approved_at: string | null;
      mine: boolean;
    } | null;
  }[];
};

export async function loadCopilotContext(supabase: SupabaseClient, requestId: string): Promise<CopilotContext | null> {
  const { data, error } = await supabase.rpc('pro_copilot_context', { p_request_id: requestId });
  if (error || !data) return null;
  const d = data as ContextJson;
  return {
    isCouple: d.is_couple,
    sessionEndedAt: d.session_ended_at,
    aiEnabled: aiEnabled(),
    people: d.people.map((p) => ({
      role: p.role,
      label: { firstName: p.first_name, initial: p.initial },
      locale: p.locale === 'en' ? 'en' : 'ar',
      referrals: (p.referrals ?? []).filter((s): s is ReferralStep => (referralSteps as readonly string[]).includes(s)),
      summary: p.summary
        ? {
            status: p.summary.status,
            engine: p.summary.engine,
            body: p.summary.body,
            problems: (p.summary.problems ?? []).filter(isSummaryProblem),
            updatedAt: p.summary.updated_at,
            approvedAt: p.summary.approved_at,
            mine: p.summary.mine,
          }
        : null,
    })),
  };
}

export const COPILOT_CALLS_PER_HOUR = 40;

export async function copilotCallsLeft(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('pro_copilot_calls_last_hour');
  return !error && typeof data === 'number' && data < COPILOT_CALLS_PER_HOUR;
}

/** The patient's approved summaries. Never the AI draft. */
export async function loadMySessionSummaries(supabase: SupabaseClient): Promise<PatientSummary[]> {
  const { data, error } = await supabase.rpc('my_session_summaries');
  if (error || !data) return [];
  type Row = { id: string; body: string; locale: string; engine: string; approved_at: string; counsellor_name: string | null };
  return (data as Row[]).map((r) => ({
    id: r.id,
    body: r.body,
    locale: r.locale === 'en' ? 'en' : 'ar',
    engine: r.engine === 'ai' ? 'ai' : 'manual',
    approvedAt: r.approved_at,
    counsellorName: r.counsellor_name ?? '',
  }));
}
