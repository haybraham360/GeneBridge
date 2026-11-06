/**
 * Cleanup job (task 12): deletes scan uploads older than 15 minutes and
 * cached audio older than 24 hours, in case a delete failed. Run by Vercel
 * Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`. Every scan
 * also runs the same sweep, so nothing outlives the limit for long even
 * without the cron.
 */
import { sweepExpired } from '@/lib/scan/storage';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const removed = await sweepExpired(createAdminClient());
  return Response.json(removed, { headers: { 'Cache-Control': 'no-store' } });
}
