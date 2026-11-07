/**
 * Makes one account a GeneBridge admin (task 14): the only role that can
 * review verification documents. Shared by scripts/create-admin.ts and the
 * tests. Service role only; never reachable from the app.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

export function parseContact(raw: string): { email: string } | { phone: string } | null {
  const value = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { email: value.toLowerCase() };
  const digits = value.replace(/[\s()+-]/g, '');
  if (/^\d{8,15}$/.test(digits)) return { phone: digits };
  return null;
}

async function findUser(admin: SupabaseClient, contact: { email: string } | { phone: string }): Promise<User | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => ('email' in contact ? u.email === contact.email : u.phone === contact.phone));
    if (found || data.users.length < 1000) return found;
  }
}

/** Creates the account if needed and sets role = 'admin'. Returns the user id. */
export async function ensureAdmin(admin: SupabaseClient, contact: { email: string } | { phone: string }): Promise<{ id: string; created: boolean }> {
  let user = await findUser(admin, contact);
  let created = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      ...contact,
      ...('email' in contact ? { email_confirm: true } : { phone_confirm: true }),
      user_metadata: { display_name: 'GeneBridge admin', locale: 'en' },
    });
    if (error) throw error;
    user = data.user;
    created = true;
  }
  const { error } = await admin.from('profiles').update({ role: 'admin', onboarding_step: 8 }).eq('user_id', user.id);
  if (error) throw error;
  // An admin has agreed to the terms like everyone else.
  const { data: consent } = await admin.from('consents').select('id').eq('user_id', user.id).eq('kind', 'terms').is('revoked_at', null).maybeSingle();
  if (!consent) await admin.from('consents').insert({ user_id: user.id, kind: 'terms' });
  return { id: user.id, created };
}
