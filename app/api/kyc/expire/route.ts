/**
 * Daily verification job (task 14). Run by Vercel Cron (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * 1. Licences past their expiry date: kyc_expire_licences() sets them to
 *    expired, turns accepting patients off, flags upcoming bookings for an
 *    admin, notifies the professional, audits and logs pro_expired. (Access
 *    already ends on the expiry day: is_verified_professional() checks the
 *    date itself.)
 * 2. Verification documents no submission references (abandoned drafts, or
 *    a failed delete after a decision) are removed.
 */
import { emailStatusChange } from '@/lib/kyc/notify';
import { sweepOrphans } from '@/lib/kyc/storage';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('kyc_expire_licences');
  if (error) {
    console.error(`kyc expiry failed: ${error.message}`);
    return Response.json({ error: 'expiry_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const expired = ((data as string[] | null) ?? []).length;
  for (const userId of (data as string[] | null) ?? []) await emailStatusChange(admin, userId, 'expired');
  const documentsRemoved = await sweepOrphans(admin);
  return Response.json({ expired, documentsRemoved }, { headers: { 'Cache-Control': 'no-store' } });
}
