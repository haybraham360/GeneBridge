import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { focusFor, isFollowReason, pathFor, type Followed, type UserPath } from './pathRules';

export * from './pathRules';

/** Screening condition codes → catalogue ids (codes predate the catalogue). */
function conditionIdForCode(code: string): string {
  return code === 'sickle_cell' ? 'sickle_cell_disease' : code;
}

/** Which followed condition Home focuses on. Holds a library id only. */
export const FOCUS_COOKIE = 'gb_focus_condition';

export type UserFinding = { conditionId: string; status: 'carrier' | 'affected' | 'no_variant' };

export type UserPathInfo = {
  path: UserPath;
  hasResult: boolean;
  /**
   * The person's own unflagged findings, as catalogue ids. Flagged or
   * uncertain results are left out: they're never explained (guardrail 4).
   */
  findings: UserFinding[];
  followed: Followed[];
  focus: Followed | null;
};

/**
 * The one place every page reads the person's path from (task 11). Runs as
 * the signed-in user, so row-level security applies: only their own result
 * and their own followed conditions.
 */
export async function loadUserPath(supabase: SupabaseClient): Promise<UserPathInfo> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { path: 'exploring', hasResult: false, findings: [], followed: [], focus: null };

  const [{ data: results }, { data: rows }, store] = await Promise.all([
    supabase
      .from('screening_results')
      .select('condition_code, status, flagged')
      .eq('owner_id', user.id)
      .not('claimed_at', 'is', null),
    supabase
      .from('followed_conditions')
      .select('condition_id, reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    cookies(),
  ]);

  const followed: Followed[] = ((rows ?? []) as { condition_id: string; reason: string; created_at: string }[])
    .filter((r) => isFollowReason(r.reason))
    .map((r) => ({ conditionId: r.condition_id, reason: r.reason as Followed['reason'], createdAt: r.created_at }));

  const resultRows = (results ?? []) as { condition_code: string; status: string; flagged: boolean }[];
  const findings: UserFinding[] = resultRows
    .filter((r) => !r.flagged && (r.status === 'carrier' || r.status === 'affected' || r.status === 'no_variant'))
    .map((r) => ({ conditionId: conditionIdForCode(r.condition_code), status: r.status as UserFinding['status'] }));

  const hasResult = resultRows.length > 0;
  return {
    path: pathFor({ hasClaimedResult: hasResult }),
    hasResult,
    findings,
    followed,
    focus: focusFor(followed, store.get(FOCUS_COOKIE)?.value),
  };
}
