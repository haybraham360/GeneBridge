import 'server-only';
/**
 * Server-side data access for Ask GeneBridge, as the signed-in user (RLS
 * applies). The user's result is read only when they turned on "Use my
 * result in this chat", and only as a minimal summary.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoupleSummary, RespondDeps, ResultSummary } from './types';

export function respondDeps(supabase: SupabaseClient, userId: string): RespondDeps {
  return {
    async getMyResult(): Promise<ResultSummary | null> {
      const { data: rows } = await supabase
        .from('screening_results')
        .select('condition_code, status, flagged')
        .eq('owner_id', userId)
        .order('claimed_at', { ascending: false });
      const findings = (rows ?? []) as { condition_code: string; status: string; flagged: boolean }[];
      if (!findings.length) return null;
      // Flagged or uncertain anywhere on the report: nothing leaves this function.
      if (findings.some((f) => f.flagged || f.status === 'uncertain')) return { escalate: true };
      // Several findings (task 10): the first change found, else "no variant".
      const data = findings.find((f) => f.status === 'carrier' || f.status === 'affected') ?? findings[0];
      return {
        escalate: false,
        condition: data.condition_code as string,
        status: data.status as 'carrier' | 'affected' | 'no_variant',
      };
    },
    async getCouple(): Promise<CoupleSummary | null> {
      const { data, error } = await supabase.rpc('assistant_couple_summary');
      const row = (data as { available: boolean; partner_name: string; condition_code: string; my_status: string; partner_status: string }[] | null)?.[0];
      if (error || !row?.available) return null;
      return {
        partnerName: row.partner_name,
        condition: row.condition_code,
        myStatus: row.my_status as CoupleSummary['myStatus'],
        partnerStatus: row.partner_status as CoupleSummary['partnerStatus'],
      };
    },
  };
}

export const RATE_LIMIT_PER_HOUR = 30;

/** Removes the caller's conversations and messages older than 30 days. */
export async function deleteExpired(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await supabase.from('assistant_messages').delete().lt('created_at', cutoff);
  await supabase.from('assistant_conversations').delete().lt('updated_at', cutoff);
}
