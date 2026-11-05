/**
 * Personalised paths (task 11). Pure rules, shared by server code and tests.
 *
 *   result:    the person has a claimed screening report;
 *   exploring: no result yet; they follow conditions to learn about.
 *
 * Someone with a result can follow conditions too; they stay on the result
 * path. An exploring user who adds a result moves to the result path and
 * keeps the conditions they follow.
 */

export type UserPath = 'result' | 'exploring';

export const followReasons = ['family_history', 'think_i_have', 'learning'] as const;
export type FollowReason = (typeof followReasons)[number];

export function isFollowReason(value: unknown): value is FollowReason {
  return typeof value === 'string' && (followReasons as readonly string[]).includes(value);
}

export function pathFor({ hasClaimedResult }: { hasClaimedResult: boolean }): UserPath {
  return hasClaimedResult ? 'result' : 'exploring';
}

/** Onboarding's "What brings you here?" answer → why they follow a condition. */
export function followReasonFor(onboardingReason: string | null | undefined): FollowReason {
  if (onboardingReason === 'family_condition') return 'family_history';
  if (onboardingReason === 'think_condition') return 'think_i_have';
  return 'learning';
}

export type Followed = { conditionId: string; reason: FollowReason; createdAt: string };

/** The condition Home focuses on: the one chosen, if still followed, else the first. */
export function focusFor(followed: Followed[], chosen: string | null | undefined): Followed | null {
  return followed.find((f) => f.conditionId === chosen) ?? followed[0] ?? null;
}
