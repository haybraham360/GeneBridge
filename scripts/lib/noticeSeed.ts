/**
 * The three demo family notices (task 08), sent by Mariam. Shared by
 * `npm run seed:notices` and the tests. Resets opened, stopped and
 * suppressed states each time. All synthetic.
 */
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoUsers } from '../../lib/auth/demoUsers';
import { demoNotices } from '../../lib/notices/demo';
import { DEV_NOTICE_SALT, hashPhoneWith } from '../../lib/notices/phoneFormat';

export function noticeSalt(): string {
  const value = process.env.NOTICE_PHONE_SALT;
  return value && value.length >= 16 ? value : DEV_NOTICE_SALT;
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 1000) return undefined;
  }
}

export async function seedNotices(admin: SupabaseClient): Promise<{ senderId: string }> {
  const mariam = demoUsers.find((u) => u.key === 'mariam');
  const senderId = mariam ? await findUserId(admin, mariam.email) : undefined;
  if (!senderId) throw new Error('Mariam not found. Run `npm run seed:auth` first.');

  const salt = noticeSalt();
  const hashes = demoNotices.map((n) => hashPhoneWith(salt, n.phone));
  await admin.from('notice_suppressions').delete().in('recipient_phone_hash', hashes);
  const { error: deleteError } = await admin
    .from('family_notifications')
    .delete()
    .in('code', demoNotices.map((n) => n.code));
  if (deleteError) throw new Error(`family_notifications: ${deleteError.message}. Apply the task 08 migration first.`);

  const day = 86_400_000;
  const now = Date.now();
  const rows = demoNotices.map((n, i) => {
    const sent = n.expired ? now - 100 * day : now - 2 * day;
    return {
      sender_id: senderId,
      batch_id: randomUUID(),
      code: n.code,
      recipient_phone_hash: hashes[i],
      channel: 'whatsapp',
      locale: n.locale,
      condition_id: n.condition_id,
      anonymous: true,
      signed_name: null,
      created_at: new Date(sent).toISOString(),
      expires_at: new Date(sent + 90 * day).toISOString(),
      is_demo: true,
    };
  });
  const { error } = await admin.from('family_notifications').insert(rows);
  if (error) throw new Error(`family_notifications: ${error.message}`);
  return { senderId };
}
