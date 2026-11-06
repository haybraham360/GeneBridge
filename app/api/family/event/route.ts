/**
 * Family map events from the browser (task 13, section 7): kept, undone,
 * question answered, cousin marriage marked. Counts and categories only;
 * anything else is refused.
 */
import { logEvents } from '@/lib/auth/events';
import { parseClientEvent } from '@/lib/family/events';
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
