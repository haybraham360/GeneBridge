import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase/server';

/**
 * The signed-in person's own screening report (task 10): one row per
 * screened condition. Read as the user, so only their own rows. A flagged
 * or uncertain finding anywhere on the report hides every explanation: the
 * page shows only the counsellor handoff (guardrail 4), and flagged rows
 * never reach the browser.
 */
export type MyFinding = {
  conditionId: string;
  status: 'carrier' | 'affected';
  /** From a photographed report (task 12), not yet confirmed by the screening centre. */
  unverified: boolean;
};

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
      /** Any finding shown comes from a photographed report. */
      unverified: boolean;
    };

type Row = {
  condition_code: string;
  status: string;
  flagged: boolean;
  reported_at: string | null;
  centre: string | null;
  source?: string;
  verified?: boolean;
  claimed_at?: string | null;
};

type Rankable = { condition_code: string; source?: string; verified?: boolean; claimed_at?: string | null };

/**
 * One row per condition (task 12): a screening centre's result wins over a
 * scanned one, then a verified one, then the newest.
 */
export function latestPerCondition<T extends Rankable>(rows: T[]): T[] {
  const rank = (r: T) => [r.source === 'scan' ? 0 : 1, r.verified === false ? 0 : 1, r.claimed_at ?? ''] as const;
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.condition_code);
    if (!current) {
      best.set(row.condition_code, row);
      continue;
    }
    const [a, b] = [rank(row), rank(current)];
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) best.set(row.condition_code, row);
  }
  return [...best.values()];
}

/** Screening condition codes → catalogue ids (codes predate the catalogue). */
export function conditionIdForCode(code: string): string {
  return code === 'sickle_cell' ? 'sickle_cell_disease' : code;
}

export async function loadMyReport(supabase: SupabaseClient): Promise<MyReport> {
  const user = await getAuthUser(supabase);
  if (!user) return { state: 'missing' };
  const query = (columns: string) =>
    supabase.from('screening_results').select(columns).eq('owner_id', user.id).not('claimed_at', 'is', null);
  let { data, error } = await query('condition_code, status, flagged, reported_at, centre, source, verified, claimed_at');
  // Before the task 12 migration the scan columns don't exist (undefined column).
  if (error?.code === '42703') ({ data, error } = await query('condition_code, status, flagged, reported_at, centre'));
  const rows = latestPerCondition((data ?? []) as unknown as Row[]);
  if (rows.length === 0) return { state: 'missing' };
  if (rows.some((r) => r.flagged || r.status === 'uncertain')) return { state: 'flagged' };

  const findings = rows
    .filter((r) => r.status === 'carrier' || r.status === 'affected')
    .map((r) => ({
      conditionId: conditionIdForCode(r.condition_code),
      status: r.status as MyFinding['status'],
      unverified: r.verified === false,
    }))
    .sort((a, b) => (a.status === b.status ? a.conditionId.localeCompare(b.conditionId) : a.status === 'carrier' ? -1 : 1));
  return {
    state: 'ready',
    reportedAt: rows.find((r) => r.reported_at)?.reported_at ?? null,
    centre: rows.find((r) => r.centre)?.centre ?? null,
    screenedCount: rows.length,
    findings,
    unverified: rows.some((r) => r.verified === false),
  };
}
