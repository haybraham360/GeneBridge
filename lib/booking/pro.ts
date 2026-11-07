import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { viewerTimeZone } from './time';

/** The professional's own time zone and whether Google Calendar is connected. */
export async function loadProBookingContext(supabase: SupabaseClient, userId: string): Promise<{ timeZone: string; googleConnected: boolean; googleEmail: string | null }> {
  const [{ data: pro }, { data: connection }] = await Promise.all([
    supabase.from('professional_profiles').select('time_zone').eq('user_id', userId).maybeSingle(),
    // The token column isn't readable from here (or anywhere but the server's service role).
    supabase.from('calendar_connections').select('google_email').eq('user_id', userId).maybeSingle(),
  ]);
  return { timeZone: viewerTimeZone(pro?.time_zone), googleConnected: Boolean(connection), googleEmail: connection?.google_email ?? null };
}
