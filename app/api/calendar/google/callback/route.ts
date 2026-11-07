/**
 * Google's redirect after "Connect Google Calendar" (task 15, section 5).
 * Checks the one-time state, exchanges the code, encrypts the refresh token
 * and stores it (service role; never readable from the browser).
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { encryptToken } from '@/lib/calendar/crypto';
import { exchangeCode } from '@/lib/calendar/google';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient, getAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
const STATE_COOKIE = 'gb_gcal_state';

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: NextRequest) {
  const [state, cookieLocale, cookieUser] = (request.cookies.get(STATE_COOKIE)?.value ?? '').split('.');
  const locale = cookieLocale === 'en' ? 'en' : 'ar';
  const back = (status: string) => {
    const response = NextResponse.redirect(new URL(`/${locale}/pro/settings?calendar=${status}`, request.url));
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/calendar/google' });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  if (params.get('error')) return back('cancelled');
  if (!code || !state || !sameState(params.get('state') ?? '', state)) return back('error');

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user || user.id !== cookieUser) return back('error');
  const { data: isPro } = await supabase.rpc('pro_is_professional');
  if (isPro !== true) return back('error');

  try {
    const { refreshToken, email } = await exchangeCode(code);
    const admin = createAdminClient();
    const { error } = await admin.from('calendar_connections').upsert(
      {
        user_id: user.id,
        provider: 'google',
        encrypted_refresh_token: encryptToken(refreshToken),
        google_email: email,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) return back('error');
    await admin.from('events').insert({ user_id: user.id, name: 'calendar_connected', props: { provider: 'google' } });
    return back('connected');
  } catch {
    return back('error');
  }
}
