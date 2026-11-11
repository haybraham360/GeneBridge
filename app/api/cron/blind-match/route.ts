/**
 * Blind Match cleanup (task 17): deletes sessions past their expiry (10
 * minutes unanswered, 7 days after an answer), usage older than 30 days and
 * old join attempts. Run daily by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`. Screens also ignore expired rows, so
 * nothing shows between runs.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc('blind_match_cleanup');
  if (error) {
    console.error(`blind match cleanup failed: ${error.message}`);
    return Response.json({ error: 'cleanup_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ deleted: data ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
