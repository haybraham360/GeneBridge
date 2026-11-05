/**
 * Message drafter (task 09). Signed-in only. Two actions:
 *
 *   { action: "rewrite", text, tone, guide, recipient, locale }
 *     → { text, engine }   the person's own draft in the chosen tone
 *   { action: "check", text }
 *     → { flagged, who }   the classifier's privacy second opinion
 *
 * Nothing is stored, and the text is never logged. GeneBridge never sends
 * the message: the browser copies it or opens WhatsApp.
 */
import { aiEnabled, draftMentionsSomeoneElse } from '@/lib/assistant/claude';
import { logEvents } from '@/lib/auth/events';
import { MAX_DRAFT_INPUT, rewriteDraft } from '@/lib/talk/draft';
import { isGuideId, isRecipient, isTone } from '@/lib/talk/guides';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const REWRITES_PER_HOUR = 30;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: 'signed_out' }, 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: 'empty' }, 400);
  if (text.length > MAX_DRAFT_INPUT) return json({ error: 'too_long' }, 400);

  if (body.action === 'check') {
    if (!aiEnabled()) return json({ flagged: false, who: null });
    const result = await draftMentionsSomeoneElse(text).catch(() => ({ flagged: false, who: null }));
    return json(result);
  }

  if (body.action !== 'rewrite' || !isTone(body.tone) || !isGuideId(body.guide) || !isRecipient(body.recipient)) {
    return json({ error: 'bad_request' }, 400);
  }
  const locale = body.locale === 'ar' ? 'ar' : 'en';

  const { data: used, error } = await supabase.rpc('talk_drafts_last_hour');
  if (error) return json({ error: 'not_set_up' }, 503);
  if ((used as number) >= REWRITES_PER_HOUR) return json({ error: 'rate_limited' }, 429);

  const result = await rewriteDraft({ text, tone: body.tone, guide: body.guide, recipient: body.recipient, locale });
  // The tone only; never the text.
  await logEvents(supabase, user.id, [{ name: 'talk_draft_tone_used', props: { tone: body.tone } }]);
  return json({ text: result.text, engine: result.engine });
}
