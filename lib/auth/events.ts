import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth analytics events. Props never hold personal data: no phone numbers,
 * emails, names or codes. Only the allow-listed fields below.
 */
export type AuthMethod = 'phone' | 'email' | 'password' | 'google' | 'uae_pass';

export type AuthEvent =
  | { name: 'auth_method_selected'; props: { method: AuthMethod } }
  | { name: 'sign_up_completed'; props?: undefined }
  | { name: 'sign_in_completed'; props?: undefined }
  | { name: 'consent_given'; props: { kind: 'terms' } };

/** Writes events as the signed-in user (RLS: insert own only). Never throws. */
export async function logEvents(supabase: SupabaseClient, userId: string, events: AuthEvent[]) {
  if (events.length === 0) return;
  const { error } = await supabase.from('events').insert(
    events.map((e) => ({
      user_id: userId,
      name: e.name,
      props: e.props ?? {},
    })),
  );
  // Analytics must never block sign-in. Log the event name only.
  if (error) console.warn('events insert failed', events.map((e) => e.name).join(','));
}
