/**
 * Talking-to-family events from the page (task 09 section 7). Allow-listed
 * names and props only: never message text or feelings. Accepts
 * navigator.sendBeacon, so a click that navigates away is still counted.
 */
import { logEvents } from '@/lib/auth/events';
import { parseClientEvent } from '@/lib/talk/events';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const body = await request
    .text()
    .then((raw) => JSON.parse(raw) as unknown)
    .catch(() => null);
  const event = parseClientEvent(body);
  if (!event) return Response.json({ ok: false }, { status: 400 });
  await logEvents(supabase, user.id, [event]);
  return Response.json({ ok: true });
}
