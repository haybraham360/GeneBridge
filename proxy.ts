import { createServerClient } from '@supabase/ssr';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import {
  IDLE_LIMIT_MS,
  IDLE_REASON,
  isAdminPath,
  isAnalystPath,
  isProfessionalPath,
  isNoticePath,
  isProtectedPath,
  LAST_ACTIVE_COOKIE,
  NOTICE_PREVIEW_PATH,
} from './lib/auth/routes';
import { newNonce, noticeCsp, noticeHeaders } from './lib/notices/headers';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

/** Splits `/en/home/x` into `en` and `/home/x`. */
function splitLocale(pathname: string) {
  const [, first = '', ...rest] = pathname.split('/');
  const locale = (routing.locales as readonly string[]).includes(first) ? first : null;
  return locale
    ? { locale, path: `/${rest.join('/')}`.replace(/\/$/, '') || '/', prefixed: true }
    : { locale: routing.defaultLocale, path: pathname, prefixed: false };
}

function withNoticeHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  for (const [name, value] of Object.entries(noticeHeaders)) response.headers.set(name, value);
  return response;
}

/** Drops every Set-Cookie (e.g. next-intl's locale cookie) from a response. */
function withoutCookies(response: NextResponse) {
  response.cookies.getAll().forEach((cookie) => response.cookies.delete(cookie.name));
  response.headers.delete('set-cookie');
  return response;
}

/**
 * Family notice pages (task 08 section 5). The relative is never signed in:
 * no Supabase session, no cookies set or read, no idle timer. A per-request
 * nonce lets Next's own scripts run under a strict CSP. Only the sender's
 * preview reads the session, to require sign-in.
 */
async function noticeProxy(request: NextRequest, locale: string, path: string) {
  const nonce = newNonce();
  const csp = noticeCsp(nonce, { dev: process.env.NODE_ENV === 'development' });
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  headers.set('X-NEXT-INTL-LOCALE', locale);

  const preview = path === NOTICE_PREVIEW_PATH;
  if (!preview) {
    // The page can't read GeneBridge cookies even if the visitor has some.
    headers.delete('cookie');
    return withNoticeHeaders(NextResponse.next({ request: { headers } }), csp);
  }

  const response = NextResponse.next({ request: { headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let signedIn = false;
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }
  if (!signedIn) {
    const target = new URL(`/${locale}/auth`, request.url);
    target.searchParams.set('next', path);
    return redirectWithCookies(target, response);
  }
  return withNoticeHeaders(response, csp);
}

/** A plain 404 that keeps any auth cookies, so a route doesn't announce itself. */
function notFoundFor(request: NextRequest, locale: string, from: NextResponse) {
  const notFound = NextResponse.rewrite(new URL(`/${locale}/admin/not-found`, request.url), { status: 404 });
  from.cookies.getAll().forEach((cookie) => notFound.cookies.set(cookie));
  return notFound;
}

/** Redirect that keeps any auth cookies Supabase just set or cleared. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const response = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export default async function proxy(request: NextRequest) {
  const notice = splitLocale(request.nextUrl.pathname);
  if (isNoticePath(notice.path)) {
    if (notice.prefixed) return noticeProxy(request, notice.locale, notice.path);
    // No locale yet: next-intl redirects, but without setting its cookie.
    const redirected = intl(request);
    return withNoticeHeaders(withoutCookies(redirected), noticeCsp(newNonce()));
  }

  // 1. Locale routing. If next-intl redirects (no locale prefix yet), let it.
  const response = intl(request);
  if (response.headers.has('location')) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  const isProtected = isProtectedPath(path);

  // If Supabase's redirect URL list doesn't include the callback, email and
  // Google links fall back to the Site URL (usually the home page) with the
  // sign-in code attached. Send those to the callback so sign-in still works.
  const { searchParams } = request.nextUrl;
  if (
    path !== '/auth/callback' &&
    (searchParams.has('code') || (searchParams.has('token_hash') && searchParams.has('type')))
  ) {
    const target = new URL(`/${locale}/auth/callback`, request.url);
    target.search = searchParams.toString();
    return NextResponse.redirect(target);
  }

  // Without Supabase configured (e.g. landing-only previews), fail closed.
  if (!url || !anonKey) {
    if (!isProtected) return response;
    return NextResponse.redirect(
      new URL(`/${locale}/auth?next=${encodeURIComponent(path)}`, request.url),
    );
  }

  // 2. Refresh the Supabase session and pass cookies on to the page.
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // 3. Inactivity: 30 minutes without a request or on-page activity ends the session.
  if (signedIn) {
    const lastActive = Number(request.cookies.get(LAST_ACTIVE_COOKIE)?.value);
    const idle =
      Number.isFinite(lastActive) && lastActive > 0 && Date.now() - lastActive > IDLE_LIMIT_MS;

    if (idle) {
      await supabase.auth.signOut();
      response.cookies.delete(LAST_ACTIVE_COOKIE);
      if (!isProtected && path !== '/auth') return response;
      const target = new URL(`/${locale}/auth`, request.url);
      target.searchParams.set('reason', IDLE_REASON);
      if (isProtected) target.searchParams.set('next', path);
      return redirectWithCookies(target, response);
    }

    // Not on server-action calls: a cookie set there makes Next re-render the
    // whole page before the action finishes (about a second per onboarding
    // step). On-page activity already refreshes it from the browser
    // (IdleSignOut), and the next page request sets it here.
    if (!request.headers.has('next-action')) {
      response.cookies.set(LAST_ACTIVE_COOKIE, String(Date.now()), {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      });
    }
  }

  // 4. Protected routes: signed-out visitors go to /auth and come back after.
  if (isProtected && !signedIn) {
    const target = new URL(`/${locale}/auth`, request.url);
    target.searchParams.set('next', path);
    return redirectWithCookies(target, response);
  }

  // 5. Analyst-only area (task 05). Anyone else gets a plain 404, not a
  // "forbidden" page, so the route doesn't announce itself. The page checks
  // again, and every figure is guarded by the database functions as well.
  if (signedIn && isAnalystPath(path)) {
    const { data: analyst, error } = await supabase.rpc('analytics_is_analyst');
    if (error || analyst !== true) {
      const notFound = NextResponse.rewrite(new URL(`/${locale}/admin/not-found`, request.url), {
        status: 404,
      });
      response.cookies.getAll().forEach((cookie) => notFound.cookies.set(cookie));
      return notFound;
    }
  }

  // 6. Professional workspace (tasks 07 and 14): any professional, same 404
  // rule. Unverified professionals reach their own dashboard; the layout and
  // every database function check verification before any patient data.
  if (signedIn && isProfessionalPath(path)) {
    const { data: professional, error } = await supabase.rpc('pro_is_professional');
    if (error || professional !== true) return notFoundFor(request, locale, response);
  }

  // 7. Verification review (task 14): admins only, same 404 rule.
  if (signedIn && isAdminPath(path)) {
    const { data: admin, error } = await supabase.rpc('kyc_is_admin');
    if (error || admin !== true) return notFoundFor(request, locale, response);
  }

  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
