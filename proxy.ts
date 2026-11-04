import { createServerClient } from '@supabase/ssr';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { IDLE_LIMIT_MS, IDLE_REASON, isProtectedPath, LAST_ACTIVE_COOKIE } from './lib/auth/routes';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

/** Splits `/en/home/x` into `en` and `/home/x`. */
function splitLocale(pathname: string) {
  const [, first = '', ...rest] = pathname.split('/');
  const locale = (routing.locales as readonly string[]).includes(first) ? first : null;
  return locale
    ? { locale, path: `/${rest.join('/')}`.replace(/\/$/, '') || '/' }
    : { locale: routing.defaultLocale, path: pathname };
}

/** Redirect that keeps any auth cookies Supabase just set or cleared. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const response = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export default async function proxy(request: NextRequest) {
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

    response.cookies.set(LAST_ACTIVE_COOKIE, String(Date.now()), {
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  // 4. Protected routes: signed-out visitors go to /auth and come back after.
  if (isProtected && !signedIn) {
    const target = new URL(`/${locale}/auth`, request.url);
    target.searchParams.set('next', path);
    return redirectWithCookies(target, response);
  }

  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
