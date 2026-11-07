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
  // The sender's preview of a family notice. The notice itself is public.
  '/family-notice/preview',
] as const;

export function isProtectedPath(path: string): boolean {
  return protectedPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * The relative's family notice pages (task 08): public, no cookies, no
 * tracking, strict CSP. Includes the sender's preview.
 */
export function isNoticePath(path: string): boolean {
  return path === '/family-notice' || path.startsWith('/family-notice/');
}

export const NOTICE_PREVIEW_PATH = '/family-notice/preview';

/**
 * Admin pages: verification review (task 14) and demo data (task 15). Admins
 * only. Everyone else gets a 404.
 */
const ADMIN_SECTIONS = ['/admin/verifications', '/admin/demo-data'];

export function isAdminPath(path: string): boolean {
  return ADMIN_SECTIONS.some((section) => path === section || path.startsWith(`${section}/`));
}

/** Paths only analysts may open (task 05). Everyone else gets a 404. */
export function isAnalystPath(path: string): boolean {
  return (path === '/admin' || path.startsWith('/admin/')) && !isAdminPath(path);
}

/**
 * The professional workspace (tasks 07 and 14): any professional, verified or
 * not. Unverified professionals see their dashboard with locked pages; every
 * patient-facing database function checks verification itself.
 */
export function isProfessionalPath(path: string): boolean {
  return path === '/pro' || path.startsWith('/pro/');
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

/** The professional workspace (tasks 07 and 14). */
export const PRO_HOME = '/pro';

/** The admin's verification queue (task 14). */
export const ADMIN_HOME = '/admin/verifications';

/** The analyst's only screen (task 05). */
export const ANALYST_HOME = '/admin/analytics';

/** A partner invite link (task 04). Accepted before onboarding continues. */
export function isInvitePath(path: string | null): boolean {
  return path !== null && /^\/invite\/[^/]+$/.test(path);
}

/** Where to send someone after they sign in (section 3 of task 03). */
export function destinationFor(profile: DestinationProfile, next: string | null): string {
  if (profile?.role === 'professional') {
    // Professional onboarding (4 steps) first, then the workspace.
    if (profile.onboarding_step < FINISHED_ONBOARDING_STEP) return '/onboarding';
    return next?.startsWith(PRO_HOME) ? next : PRO_HOME;
  }
  if (profile?.role === 'admin') return next && isAdminPath(next) ? next : ADMIN_HOME;
  if (profile?.role === 'analyst') return next && isAnalystPath(next) ? next : ANALYST_HOME;
  // An invite is accepted first; the invite page then sends them on.
  if (isInvitePath(next)) return next as string;
  if (!profile || profile.onboarding_step < FINISHED_ONBOARDING_STEP) return '/onboarding';
  // The dashboard is the signed-in home page.
  return next ?? '/dashboard';
}
