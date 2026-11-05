/**
 * Small analytics events from the chat UI. Allow-listed names and props
 * only; never message text.
 */
import { logEvents } from '@/lib/auth/events';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  let event: { name: string; props: Record<string, string | number | boolean> } | null = null;
  if (body.name === 'ai_feedback' && typeof body.helpful === 'boolean') {
    event = { name: 'ai_feedback', props: { helpful: body.helpful } };
  } else if (body.name === 'ai_result_toggle_on') {
    event = { name: 'ai_result_toggle_on', props: {} };
  } else if (
    body.name === 'teachback_answered' &&
    (body.question === 'same_each_pregnancy' || body.question === 'carrier_healthy') &&
    typeof body.correct === 'boolean'
  ) {
    // Asked after an explanation, so it counts as a "post" answer (task 05).
    event = { name: 'teachback_answered', props: { phase: 'post', question: `assistant_${body.question}`, correct: body.correct } };
  }
  if (!event) return Response.json({ ok: false }, { status: 400 });
  await logEvents(supabase, user.id, [event]);
  return Response.json({ ok: true });
}
