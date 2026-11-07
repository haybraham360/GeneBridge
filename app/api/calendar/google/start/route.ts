/**
 * "Connect Google Calendar" (task 15, section 5). Professionals only. Sends
 * them to Google with the minimum scopes, with a one-time state tied to
 * their account in an httpOnly cookie.
 */
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { authorizationUrl, googleConfigured } from '@/lib/calendar/google';
import { createClient, getAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const STATE_COOKIE = 'gb_gcal_state';

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get('locale') === 'en' ? 'en' : 'ar';
  const back = (status: string) => NextResponse.redirect(new URL(`/${locale}/pro/settings?calendar=${status}`, request.url));

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.redirect(new URL(`/${locale}/auth`, request.url));
  const { data: isPro } = await supabase.rpc('pro_is_professional');
  if (isPro !== true) return new Response(null, { status: 404 });
  if (!googleConfigured()) return back('not_configured');

  const state = randomBytes(24).toString('hex');
  const response = NextResponse.redirect(authorizationUrl(state));
  response.cookies.set(STATE_COOKIE, `${state}.${locale}.${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/calendar/google',
    maxAge: 600,
  });
  return response;
}
