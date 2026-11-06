/**
 * "Describe your family" (task 13, section 4). POST JSON (DescribeRequest):
 * the browser has already masked every name, and the tree carries no
 * labels. The reply is a server-sent event stream:
 *
 *   event: change   data: Change        a proposed person, link, condition or question
 *   event: summary  data: TurnSummary   counts for the review bar
 *   event: error    data: {"code": "..."}
 *
 * Nothing is saved here: the browser shows proposals and saves only what
 * the person keeps. Limits: 30 turns an hour, 1,000 characters a turn,
 * 60 people a tree. Logs counts only, never text.
 */
import { logEvents } from '@/lib/auth/events';
import { runDescribe } from '@/lib/family/ai/pipeline';
import { describeRequest } from '@/lib/family/ai/schema';
import type { FamilyEvent } from '@/lib/family/events';
import { DESCRIBE_HOURLY_LIMIT, MAX_DESCRIBE_CHARS } from '@/lib/family/types';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ code: 'signed_out' }, 401);

  const raw = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof raw?.text === 'string' && raw.text.trim().length > MAX_DESCRIBE_CHARS) return json({ code: 'too_long' }, 400);
  const parsed = describeRequest.safeParse(raw);
  if (!parsed.success) return json({ code: 'invalid' }, 400);
  const req = parsed.data;
  if (req.tree.members.filter((m) => m.owner).length !== 1) return json({ code: 'invalid' }, 400);

  const { data: used, error: limitError } = await supabase.rpc('family_describe_last_hour');
  if (limitError) return json({ code: 'failed' }, 503);
  if ((used as number) >= DESCRIBE_HOURLY_LIMIT) return json({ code: 'rate_limited' }, 429);

  await logEvents(supabase, user.id, [
    { name: 'family_describe_started', props: { input: req.input, locale: req.locale } },
  ] satisfies FamilyEvent[]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        const summary = await runDescribe(req, { emit: (change) => send('change', change), signal: request.signal });
        await logEvents(supabase, user.id, [
          {
            name: 'family_describe_completed',
            props: {
              people: summary.people,
              links: summary.links,
              conditions: summary.conditions,
              questions: summary.questions,
              seconds: summary.seconds,
            },
          },
        ] satisfies FamilyEvent[]);
        send('summary', summary);
      } catch (error) {
        console.warn('family describe failed', error instanceof Error ? error.name : 'unknown');
        send('error', { code: request.signal.aborted ? 'cancelled' : 'failed' });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled request.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
