/** Route rules shared by the proxy, the auth page and the server actions. */

/** Paths (without the locale prefix) that need a signed-in user. */
export const protectedPaths = [
  '/home',
  '/results',
  '/couple',
  '/simulator',
  '/family',
  '/options',
  '/counsellor',
  '/privacy',
  '/onboarding',
  '/pro',
  '/admin',
] as const;

export function isProtectedPath(path: string): boolean {
  return protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Only same-site, protected app paths are accepted as a return address, so
 * `?next=` can't be used to bounce people to another site.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || value.includes('://')) return null;
  const path = value.split(/[?#]/)[0];
  return isProtectedPath(path) ? path : null;
}

/** Inactivity limit before the session is ended (section 5 of task 03). */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;

/** Timestamp of the last activity. Not sensitive: it holds a number only. */
export const LAST_ACTIVE_COOKIE = 'gb_last_active';

/** Query flag on /auth that shows the "signed out to keep you private" notice. */
export const IDLE_REASON = 'idle';

export const FINISHED_ONBOARDING_STEP = 8;

type DestinationProfile = { role: string; onboarding_step: number } | null;

/** Where to send someone after they sign in (section 3 of task 03). */
export function destinationFor(profile: DestinationProfile, next: string | null): string {
  if (profile?.role === 'counsellor') return next ?? '/pro';
  if (!profile || profile.onboarding_step < FINISHED_ONBOARDING_STEP) return '/onboarding';
  return next ?? '/home';
}
