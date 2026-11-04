import type { EmailOtpType } from '@supabase/supabase-js';
import { hasLocale } from 'next-intl';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { finishSignIn } from '@/lib/auth/complete';
import { createClient } from '@/lib/supabase/server';

/**
 * Landing point for the email magic link and Google sign-in. Creates the
 * session, then finishes sign-in on the server (consent, facility code,
 * events) and sends the person on. Nothing personal is read from the URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const { searchParams } = request.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(`/${locale}${path}`, request.url));

  // Google sends people back with ?error=... when they cancel or it fails.
  if (searchParams.has('error')) return to('/auth?error=google');

  const supabase = await createClient();
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  let failed = true;
  if (code) {
    // PKCE flow: email link or Google, opened in the same browser.
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type) {
    // Token-hash email template: works across browsers and devices.
    failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  }
  if (failed) return to('/auth?error=link');

  try {
    const result = await finishSignIn(supabase);
    if (result.status === 'done') return to(result.redirectTo);
    if (result.status === 'needsConsent') return to('/auth');
  } catch {
    // Fall through to the error state.
  }
  return to('/auth?error=link');
}
