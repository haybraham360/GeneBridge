/**
 * Ask GeneBridge chat endpoint (task 06). POST one message; the reply
 * streams back as newline-delimited JSON:
 *
 *   {"type":"start","conversationId":"…"}
 *   {"type":"delta","text":"…"}            (repeated)
 *   {"type":"done","reply":{…}}            text, sources, risk, escalation…
 *   {"type":"error","code":"rate_limited"|"too_long"|"failed"}
 *
 * The reply has already passed the output check before the first delta is
 * sent, so nothing unchecked is ever shown. The API key stays on the server.
 */
import { extractReportText, aiEnabled } from '@/lib/assistant/claude';
import { logEvents } from '@/lib/auth/events';
import { parseFamilySnapshot } from '@/lib/assistant/family';
import { repliesFor } from '@/lib/assistant/offline';
import { redactReport } from '@/lib/assistant/report';
import { MAX_MESSAGE_LENGTH, MAX_REPORT_LENGTH, respond } from '@/lib/assistant/respond';
import { deleteExpired, RATE_LIMIT_PER_HOUR, respondDeps } from '@/lib/assistant/server';
import type { HistoryTurn, Reply, RespondMode } from '@/lib/assistant/types';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const fileTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

type Body = {
  conversationId?: unknown;
  message?: unknown;
  locale?: unknown;
  mode?: unknown;
  useMyResult?: unknown;
  family?: unknown;
  reportText?: unknown;
  file?: unknown;
};

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ type: 'error', code: 'signed_out' }, 401);

  const body = (await request.json().catch(() => ({}))) as Body;
  const locale = body.locale === 'ar' ? 'ar' : 'en';
  const mode: RespondMode = body.mode === 'simpler' || body.mode === 'detail' ? body.mode : 'normal';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ type: 'error', code: 'empty' }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ type: 'error', code: 'too_long' }, 400);

  // 30 messages per user per hour (counted from ai_question events).
  const { data: used, error: limitError } = await supabase.rpc('assistant_questions_last_hour');
  if (limitError) return json({ type: 'error', code: 'not_set_up' }, 503);
  if ((used as number) >= RATE_LIMIT_PER_HOUR) return json({ type: 'error', code: 'rate_limited' }, 429);

  // Report: pasted text, or a file read in memory and never stored.
  let reportText = typeof body.reportText === 'string' ? body.reportText.slice(0, MAX_REPORT_LENGTH) : '';
  let reportNotice: string | null = null;
  const file = body.file as { data?: unknown; mediaType?: unknown } | undefined;
  if (file && typeof file.data === 'string' && typeof file.mediaType === 'string' && fileTypes.has(file.mediaType)) {
    if (file.data.length * 0.75 > MAX_FILE_BYTES) return json({ type: 'error', code: 'file_too_large' }, 400);
    if (aiEnabled()) {
      const extracted = await extractReportText({ data: file.data, mediaType: file.mediaType }).catch(() => null);
      if (extracted) reportText = extracted.slice(0, MAX_REPORT_LENGTH);
    } else {
      reportNotice = repliesFor(locale).report.needs_ai;
    }
  }
  // Personal details are removed before anything is stored or explained.
  reportText = reportText ? redactReport(reportText) : '';

  await deleteExpired(supabase);

  // Conversation: reuse the caller's own, or start one.
  let conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
  if (conversationId) {
    const { data } = await supabase.from('assistant_conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const { data, error } = await supabase
      .from('assistant_conversations')
      .insert({ user_id: user.id, locale })
      .select('id')
      .single();
    if (error) return json({ type: 'error', code: 'failed' }, 500);
    conversationId = data.id as string;
  }

  const { data: past } = await supabase
    .from('assistant_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10);
  const history = ((past ?? []) as HistoryTurn[]).reverse();

  let reply: Reply;
  if (reportNotice && !reportText) {
    reply = {
      text: reportNotice,
      category: 'report',
      level: 1,
      sources: [],
      actions: [],
      replaced: false,
      engine: 'offline',
    };
  } else {
    reply = await respond(
      {
        message,
        locale,
        mode,
        history,
        useMyResult: body.useMyResult === true,
        family: parseFamilySnapshot(body.family),
        reportText: reportText || null,
      },
      respondDeps(supabase, user.id),
    );
  }

  const meta = {
    category: reply.category,
    level: reply.level,
    sources: reply.sources,
    risk: reply.risk ?? null,
    escalation: reply.escalation ?? null,
    actions: reply.actions,
    teachback: reply.teachback ?? null,
    prepSummary: reply.prepSummary ?? null,
    engine: reply.engine,
  };
  const userContent = reportText ? `${message}\n\n${reportText}` : message;
  const { data: saved } = await supabase
    .from('assistant_messages')
    .insert([
      { conversation_id: conversationId, user_id: user.id, role: 'user', content: userContent.slice(0, 20000) },
      { conversation_id: conversationId, user_id: user.id, role: 'assistant', content: reply.text, meta },
    ])
    .select('id, role');
  await supabase
    .from('assistant_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Analytics: categories and levels only, never message text.
  const events: { name: string; props: Record<string, string | number | boolean> }[] = [
    { name: 'ai_question', props: { category: reply.category } },
    { name: 'ai_answered', props: { level: reply.level } },
  ];
  if (reply.escalation) {
    events.push({
      name: 'ai_escalated',
      props:
        reply.escalation.kind === 'counsellor'
          ? { trigger: reply.escalation.trigger, urgency: reply.escalation.urgency }
          : { trigger: reply.escalation.kind, urgency: reply.escalation.kind },
    });
  }
  await logEvents(supabase, user.id, events);

  const replyId = (saved as { id: string; role: string }[] | null)?.find((m) => m.role === 'assistant')?.id ?? null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: 'start', conversationId });
      // The reply is already checked; stream it word by word.
      for (const piece of reply.text.match(/\S+\s*/g) ?? []) {
        send({ type: 'delta', text: piece });
        await new Promise((r) => setTimeout(r, 12));
      }
      send({ type: 'done', reply: { id: replyId, text: reply.text, ...meta } });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
