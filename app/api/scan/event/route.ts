/** Scan events the browser logs itself (counts and categories only). */
import { logEvents } from '@/lib/auth/events';
import { parseClientEvent } from '@/lib/scan/events';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const event = parseClientEvent(await request.json().catch(() => null));
  if (!event) return new Response(null, { status: 400 });
  await logEvents(supabase, user.id, [event]);
  return new Response(null, { status: 204 });
}
