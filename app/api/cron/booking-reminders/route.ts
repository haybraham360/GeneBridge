/**
 * Booking reminders (task 15, section 4): 24 hours and 1 hour before each
 * confirmed session, for the patient and the professional. In-app always
 * (queue_booking_reminders writes each one once); by email too when
 * EMAIL_PROVIDER is set, with no details in it. Run by Vercel Cron
 * (vercel.json: daily on the Hobby plan, every 15 minutes on Pro or from
 * another scheduler) with `Authorization: Bearer $CRON_SECRET`.
 */
import { emailUser } from '@/lib/email/notify';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc('queue_booking_reminders');
  if (error) {
    console.error(`booking reminders failed: ${error.message}`);
    return Response.json({ error: 'reminders_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const due = (data as { user_id: string; booking_id: string; reminder: string }[] | null) ?? [];
  for (const r of due) await emailUser(r.user_id, 'booking_reminder');
  return Response.json({ reminders: due.length }, { headers: { 'Cache-Control': 'no-store' } });
}
