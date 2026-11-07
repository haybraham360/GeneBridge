import 'server-only';
/**
 * Optional email notifications (task 15). Off unless EMAIL_PROVIDER is set.
 *
 * Guardrails 17 and 18: an email never contains message text, a name, a
 * condition, a result or anything else about health. It only says that
 * something happened and links back to GeneBridge, where the person signs
 * in to see it.
 *
 *   EMAIL_PROVIDER=resend   sends with Resend (RESEND_API_KEY, EMAIL_FROM)
 *   EMAIL_PROVIDER=log      logs that an email would be sent (no address)
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type EmailKind =
  | 'new_message'
  | 'booking_requested'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_changed'
  | 'booking_cancelled'
  | 'booking_reminder';

/** Fixed, content-free copy in both languages. */
const COPY: Record<EmailKind, { en: string; ar: string }> = {
  new_message: { en: 'You have a new message on GeneBridge.', ar: 'لديك رسالة جديدة على GeneBridge.' },
  booking_requested: { en: 'You have a new booking request on GeneBridge.', ar: 'لديك طلب حجز جديد على GeneBridge.' },
  booking_confirmed: { en: 'A GeneBridge session has been confirmed.', ar: 'تم تأكيد جلسة على GeneBridge.' },
  booking_declined: { en: 'A GeneBridge booking request has an update.', ar: 'هناك تحديث على طلب حجز في GeneBridge.' },
  booking_changed: { en: 'A GeneBridge session has been changed.', ar: 'تم تغيير جلسة على GeneBridge.' },
  booking_cancelled: { en: 'A GeneBridge session has been cancelled.', ar: 'تم إلغاء جلسة على GeneBridge.' },
  booking_reminder: { en: 'You have a GeneBridge session coming up.', ar: 'لديك جلسة قادمة على GeneBridge.' },
};

export function emailEnabled(): boolean {
  return process.env.EMAIL_PROVIDER === 'resend' || process.env.EMAIL_PROVIDER === 'log';
}

/** The fixed subject and body for a kind. Exported for the guardrail test. */
export function emailContent(kind: EmailKind, locale: 'ar' | 'en', siteUrl: string) {
  const line = COPY[kind][locale];
  const link = `${siteUrl.replace(/\/$/, '')}/${locale}/auth`;
  return {
    subject: locale === 'ar' ? 'تحديث من GeneBridge' : 'An update from GeneBridge',
    text: `${line}\n\n${locale === 'ar' ? 'سجّل الدخول لرؤيته:' : 'Sign in to see it:'} ${link}`,
  };
}

/** Sends the email to one person. Never throws: email must not block the app. */
export async function emailUser(userId: string, kind: EmailKind): Promise<void> {
  if (!emailEnabled()) return;
  try {
    const admin = createAdminClient();
    const [{ data: user }, { data: profile }, { data: pro }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from('profiles').select('locale').eq('user_id', userId).maybeSingle(),
      admin.from('professional_profiles').select('notify_email').eq('user_id', userId).maybeSingle(),
    ]);
    const address = user?.user?.email;
    // Professionals can turn email off in Settings (task 14).
    if (!address || pro?.notify_email === false) return;
    const locale = profile?.locale === 'en' ? 'en' : 'ar';
    const { subject, text } = emailContent(kind, locale, process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');

    if (process.env.EMAIL_PROVIDER === 'log') {
      console.info(`[email] ${kind} (${locale})`);
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'GeneBridge <no-reply@genebridge.app>', to: [address], subject, text }),
    });
    if (!response.ok) console.warn(`email ${kind} failed: ${response.status}`);
  } catch {
    console.warn(`email ${kind} failed`);
  }
}
