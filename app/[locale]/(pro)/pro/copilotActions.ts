'use server';
/**
 * Counsellor copilot actions (task 16). Server actions are public
 * endpoints, so each checks the counsellor role first; the database
 * functions check again. Nothing here reads patient–professional messages
 * (guardrail 17), and events carry categories and counts only.
 */
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { aiEnabled, copilotWithModel } from '@/lib/assistant/claude';
import { logEvents } from '@/lib/auth/events';
import { briefInput, hasShared, rulePoints } from '@/lib/copilot/brief';
import { blocking, briefPointsOk, checkSummary, parsePoints } from '@/lib/copilot/check';
import { briefPrompt, summaryPrompt } from '@/lib/copilot/prompts';
import { copilotCallsLeft, loadCopilotContext } from '@/lib/copilot/server';
import type { Brief, CopilotContext } from '@/lib/copilot/types';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { openRequestDetail, requireCounsellorAction } from '@/lib/pro/server';

const id = z.uuid();
const person = z.enum(['user', 'partner']);
const MAX_NOTES = 20_000;
const MAX_SUMMARY = 6000;

type Fail<E extends string> = { ok: false; error: E };

/** The summary panel's data: languages, referrals and summaries so far. */
export async function loadCopilot(requestId: string): Promise<{ ok: true; data: CopilotContext } | Fail<'error'>> {
  if (!id.safeParse(requestId).success) return { ok: false, error: 'error' };
  const { supabase } = await requireCounsellorAction();
  const data = await loadCopilotContext(supabase, requestId);
  return data ? { ok: true, data } : { ok: false, error: 'error' };
}

/**
 * The pre-session brief. Reads only what the patients shared (through
 * pro_request_detail, which writes access_log), never messages. Flagged
 * results reach the model as "flagged" only.
 */
export async function prepareBrief(requestId: string): Promise<{ ok: true; data: Brief } | Fail<'error' | 'rate_limited'>> {
  if (!id.safeParse(requestId).success) return { ok: false, error: 'error' };
  const { supabase, userId } = await requireCounsellorAction();
  if (!(await copilotCallsLeft(supabase))) return { ok: false, error: 'rate_limited' };
  const detail = await openRequestDetail(supabase, requestId);
  if (!detail) return { ok: false, error: 'error' };

  const locale = (await getLocale()) === 'en' ? 'en' : 'ar';
  const t = (await getTranslations({ locale, namespace: 'pro' })) as unknown as Translate;
  const L = proLabels(t);
  const input = briefInput(detail, {
    person: (p) => L.person(p.label),
    resultLine: (p) => (p.result ? L.resultLine(p.result) : ''),
    valueTopic: (q) => t(`detail.valueQuestions.${q}`),
  });

  let points: string[] | null = null;
  if (aiEnabled() && hasShared(input)) {
    const raw = await copilotWithModel(
      briefPrompt,
      [`<language>${locale === 'ar' ? 'Arabic' : 'English'}</language>`, `<shared>${JSON.stringify(input)}</shared>`].join('\n'),
      700,
    ).catch(() => null);
    const parsed = raw ? parsePoints(raw) : [];
    if (briefPointsOk(parsed, locale)) points = parsed;
  }
  const engine = points ? 'ai' : 'rules';
  points ??= rulePoints(input, L.list).map((p) => t(`copilot.brief.rules.${p.key}`, p.values));
  // A flagged result always leads with the hard rule, whatever the model wrote.
  if (engine === 'ai') {
    const flagged = input.people.filter((p) => p.finding?.flagged).map((p) => t('copilot.brief.rules.flagged', { name: p.name }));
    points = [...flagged, ...points];
  }

  await logEvents(supabase, userId, [{ name: 'copilot_brief_opened', props: { engine } }]);
  return { ok: true, data: { engine, points, generatedAt: new Date().toISOString() } };
}

const draftInput = z.object({ requestId: id, person, notes: z.string().max(MAX_NOTES) });

/** Drafts the patient summary from the counsellor's own notes and saves it as a draft. */
export async function draftSummary(
  input: z.input<typeof draftInput>,
): Promise<{ ok: true; data: CopilotContext } | Fail<'error' | 'rate_limited' | 'not_set_up' | 'no_notes' | 'failed'>> {
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'error' };
  const { requestId, notes } = parsed.data;
  if (!aiEnabled()) return { ok: false, error: 'not_set_up' };
  if (notes.trim().length < 20) return { ok: false, error: 'no_notes' };
  const { supabase, userId } = await requireCounsellorAction();
  const ctx = await loadCopilotContext(supabase, requestId);
  const who = ctx?.people.find((p) => p.role === parsed.data.person);
  if (!ctx || !who) return { ok: false, error: 'error' };
  if (who.summary?.status === 'approved') return { ok: false, error: 'error' };
  if (!(await copilotCallsLeft(supabase))) return { ok: false, error: 'rate_limited' };

  const referrals = who.referrals.map((s) => (s === 'confirmatory_test' ? 'a confirmatory test' : 'an appointment with a specialist service'));
  const raw = await copilotWithModel(
    summaryPrompt,
    [
      `<language>${who.locale === 'ar' ? 'Arabic' : 'English'}</language>`,
      `<referrals>${JSON.stringify(referrals)}</referrals>`,
      `<notes>${notes.slice(0, MAX_NOTES)}</notes>`,
    ].join('\n'),
  ).catch(() => null);
  const text = raw?.trim().slice(0, MAX_SUMMARY) ?? '';
  if (!text) return { ok: false, error: 'failed' };

  const problems = checkSummary(text, notes, who.locale);
  const { error } = await supabase.rpc('pro_save_summary', {
    p_request_id: requestId,
    p_person: parsed.data.person,
    p_body: text,
    p_ai_draft: text,
    p_problems: problems,
  });
  if (error) return { ok: false, error: 'error' };
  await logEvents(supabase, userId, [{ name: 'copilot_summary_drafted', props: { problems: problems.length } }]);
  const next = await loadCopilotContext(supabase, requestId);
  return next ? { ok: true, data: next } : { ok: false, error: 'error' };
}

const saveInput = z.object({ requestId: id, person, body: z.string().max(MAX_SUMMARY) });

/** Saves the counsellor's edits. The AI draft is kept as it was. */
export async function saveSummary(input: z.input<typeof saveInput>): Promise<{ ok: true } | Fail<'error'>> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'error' };
  const { supabase } = await requireCounsellorAction();
  const { error } = await supabase.rpc('pro_save_summary', {
    p_request_id: parsed.data.requestId,
    p_person: parsed.data.person,
    p_body: parsed.data.body,
  });
  return error ? { ok: false, error: 'error' } : { ok: true };
}

const approveInput = z.object({
  requestId: id,
  person,
  body: z.string().min(1).max(MAX_SUMMARY),
  notes: z.string().max(MAX_NOTES),
  /** The counsellor ticked "I've checked the highlighted wording". */
  confirmed: z.boolean(),
});

/**
 * Approve and send. The check runs again on the final text: blocking
 * problems stop it, the rest need the counsellor's confirmation.
 */
export async function approveSummary(
  input: z.input<typeof approveInput>,
): Promise<{ ok: true; data: CopilotContext } | Fail<'error' | 'blocked' | 'needs_confirm'>> {
  const parsed = approveInput.safeParse(input);
  if (!parsed.success || !parsed.data.body.trim()) return { ok: false, error: 'error' };
  const { requestId, body, notes, confirmed } = parsed.data;
  const { supabase } = await requireCounsellorAction();
  const ctx = await loadCopilotContext(supabase, requestId);
  const who = ctx?.people.find((p) => p.role === parsed.data.person);
  if (!ctx || !who) return { ok: false, error: 'error' };

  const problems = checkSummary(body, notes, who.locale);
  if (blocking(problems).length) return { ok: false, error: 'blocked' };
  if (problems.length && !confirmed) return { ok: false, error: 'needs_confirm' };

  const { error } = await supabase.rpc('pro_approve_summary', { p_request_id: requestId, p_person: parsed.data.person, p_body: body });
  if (error) return { ok: false, error: 'error' };
  const next = await loadCopilotContext(supabase, requestId);
  return next ? { ok: true, data: next } : { ok: false, error: 'error' };
}
