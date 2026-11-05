import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The signed-in person's own screening report (task 10): one row per
 * screened condition. Read as the user, so only their own rows. A flagged
 * or uncertain finding anywhere on the report hides every explanation: the
 * page shows only the counsellor handoff (guardrail 4), and flagged rows
 * never reach the browser.
 */
export type MyFinding = { conditionId: string; status: 'carrier' | 'affected' };

export type MyReport =
  | { state: 'missing' }
  | { state: 'flagged' }
  | {
      state: 'ready';
      reportedAt: string | null;
      centre: string | null;
      screenedCount: number;
      /** Conditions with a change found, carriers first. */
      findings: MyFinding[];
    };

/** Screening condition codes → catalogue ids (codes predate the catalogue). */
export function conditionIdForCode(code: string): string {
  return code === 'sickle_cell' ? 'sickle_cell_disease' : code;
}

export async function loadMyReport(supabase: SupabaseClient): Promise<MyReport> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: 'missing' };
  const { data } = await supabase
    .from('screening_results')
    .select('condition_code, status, flagged, reported_at, centre')
    .eq('owner_id', user.id)
    .not('claimed_at', 'is', null);
  const rows = (data ?? []) as { condition_code: string; status: string; flagged: boolean; reported_at: string | null; centre: string | null }[];
  if (rows.length === 0) return { state: 'missing' };
  if (rows.some((r) => r.flagged || r.status === 'uncertain')) return { state: 'flagged' };

  const findings = rows
    .filter((r) => r.status === 'carrier' || r.status === 'affected')
    .map((r) => ({ conditionId: conditionIdForCode(r.condition_code), status: r.status as MyFinding['status'] }))
    .sort((a, b) => (a.status === b.status ? a.conditionId.localeCompare(b.conditionId) : a.status === 'carrier' ? -1 : 1));
  return {
    state: 'ready',
    reportedAt: rows.find((r) => r.reported_at)?.reported_at ?? null,
    centre: rows.find((r) => r.centre)?.centre ?? null,
    screenedCount: new Set(rows.map((r) => r.condition_code)).size,
    findings,
  };
}
