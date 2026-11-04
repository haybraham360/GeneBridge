/** Route rules shared by the proxy, the auth page and the server actions. */

/** Paths (without the locale prefix) that need a signed-in user. */
export const protectedPaths = [
  '/home',
  '/dashboard',
  '/results',
  '/couple',
  '/simulator',
  '/family',
  '/options',
  '/counsellor',
  '/privacy',
  '/onboarding',
  '/invite',
  '/pro',
  '/admin',
] as const;

export function isProtectedPath(path: string): boolean {
  return protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Paths only analysts may open (task 05). Everyone else gets a 404. */
export function isAnalystPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/');
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

/** The analyst's only screen (task 05). */
export const ANALYST_HOME = '/admin/analytics';

/** A partner invite link (task 04). Accepted before onboarding continues. */
export function isInvitePath(path: string | null): boolean {
  return path !== null && /^\/invite\/[^/]+$/.test(path);
}

/** Where to send someone after they sign in (section 3 of task 03). */
export function destinationFor(profile: DestinationProfile, next: string | null): string {
  if (profile?.role === 'counsellor') return next ?? '/pro';
  if (profile?.role === 'analyst') return next?.startsWith('/admin') ? next : ANALYST_HOME;
  // An invite is accepted first; the invite page then sends them on.
  if (isInvitePath(next)) return next as string;
  if (!profile || profile.onboarding_step < FINISHED_ONBOARDING_STEP) return '/onboarding';
  // The dashboard is the signed-in home page.
  return next ?? '/dashboard';
}
