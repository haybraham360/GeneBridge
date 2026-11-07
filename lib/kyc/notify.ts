import 'server-only';
/**
 * Email at each verification status change (task 14, section 5), on top of
 * the in-app notification the database writes. Off unless an email service
 * is configured (KYC_EMAIL_PROVIDER); the professional can also turn email off
 * in Settings. The email says only that the status changed and links to
 * /pro: never a document, a name read from one, or a reviewer's reasons.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export function statusEmailAvailable(): boolean {
  return Boolean(process.env.KYC_EMAIL_PROVIDER);
}

export async function emailStatusChange(admin: SupabaseClient, userId: string, status: string): Promise<void> {
  if (!statusEmailAvailable()) return;
  const { data: pro } = await admin.from('professional_profiles').select('notify_email').eq('user_id', userId).maybeSingle();
  if (!pro?.notify_email) return;
  // MOCK until a provider is chosen: no address or content is logged.
  console.info(`[mock email] verification status changed to ${status}`);
}
