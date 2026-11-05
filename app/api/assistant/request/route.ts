/**
 * Creates a counsellor request from the escalation card (task 06, section 4).
 * The summary is sent only if the user ticked "Share a short summary" and is
 * stored only then (enforced again in the database function).
 */
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const reasons = new Set([
  'flagged_result', 'pregnancy', 'x_linked_or_dominant', 'major_decision',
  'outside_library', 'distress', 'asked_for_person',
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' && reasons.has(body.reason) ? body.reason : null;
  const urgency = body.urgency === 'priority' ? 'priority' : 'standard';
  const share = body.shareSummary === true;
  const summary = share && typeof body.summary === 'string' ? body.summary.slice(0, 2000) : null;
  if (!reason) return Response.json({ ok: false }, { status: 400 });

  const { data, error } = await supabase.rpc('create_counsellor_request', {
    p_reason: reason,
    p_urgency: urgency,
    p_share_summary: share,
    p_summary: summary,
  });
  if (error) return Response.json({ ok: false, code: error.code === '54000' ? 'too_many' : 'failed' }, { status: 400 });
  return Response.json({ ok: true, id: data });
}
