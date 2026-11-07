import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';

/**
 * Service-role client. Bypasses row-level security, so use it only for the
 * few server-side jobs that need it (setting up a professional account,
 * encrypted verification documents, the
 * UAE PASS mock) and never with values taken on trust from the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. See .env.example.');
  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
