/**
 * Ask GeneBridge: one message in, one checked reply out (task 06).
 *
 *   1. Classify (rules; plus a small model call in AI mode).
 *   2. Safety categories get fixed replies: emergency, distress, prompt
 *      injection, pregnancy, and a flagged result (which never reaches the
 *      model).
 *   3. Everything else: the AI responder with tools, or the offline
 *      responder when no API key is set.
 *   4. Output check. A failed reply is replaced with a safe fallback and a
 *      counsellor offer.
 *
 * Used by the API route and by the evaluation (tests/assistant/eval.ts).
 */
import { numbersIn } from '@/lib/genetics/inheritance';
import { aiEnabled, assistantModel, claudeReply, refineCategory } from './claude';
import { classifyByRules, lockedCategories } from './classify';
import { draftText, offlineDraft, pregnancyReply, repliesFor, safetyReply, type Draft } from './offline';
import { findCondition, normalise } from './library';
import { checkReply } from './outputCheck';
import { redactReport } from './report';
import { addEscalation, loadMyResult, newToolContext } from './tools';
import type { Category, Reply, RespondDeps, RespondInput } from './types';

export const MAX_MESSAGE_LENGTH = 1500;

const ownFamily =
  /\bmy (family|father|mother|dad|mum|mom|uncle|aunt|brother|sister|cousin|son|daughter|husband|wife|grand\w+)|in our family|عائلتي|ابي|امي|والدي|والدتي|عمي|خالي|اخي|اختي|ابني|ابنتي|جدي/iu;
export const MAX_REPORT_LENGTH = 8000;

export type RespondOptions = {
  /** Force offline mode (tests, or no key). Defaults to AI when a key is set. */
  offline?: boolean;
};

export async function classify(input: RespondInput, useModel: boolean): Promise<Category> {
  const rule = classifyByRules(input.message, { hasReport: Boolean(input.reportText) });
  if (!useModel || lockedCategories.has(rule)) return rule;
  const refined = await refineCategory(input.message, rule);
  // The model may move a message to a safety category, never out of one.
  return refined;
}

export async function respond(input: RespondInput, deps: RespondDeps, options: RespondOptions = {}): Promise<Reply> {
  const useAi = !options.offline && aiEnabled();
  const ctx = newToolContext(input.locale, input.useMyResult, deps);
  const category = await classify(input, useAi);

  // Fixed replies first.
  let draft: Draft | null = safetyReply(category, input.locale, ctx);
  if (!draft && category === 'pregnancy') draft = pregnancyReply(input, ctx);
  if (!draft && input.useMyResult && (category === 'personal_result' || category === 'report')) {
    const result = await loadMyResult(ctx);
    if (result?.escalate) {
      // A flagged result is never explained and never sent to the model.
      addEscalation(ctx, 'flagged_result', 'priority');
      draft = { paragraphs: [repliesFor(input.locale).result.flagged], level: 3, actions: [] };
    }
  }

  let text: string;
  let level: Reply['level'];
  let actions: Reply['actions'] = [];
  let teachback: Reply['teachback'];
  let prepSummary: string | undefined;
  let engine = 'offline';

  if (draft) {
    text = draftText(draft);
    ({ level, actions, teachback, prepSummary } = draft);
  } else if (useAi) {
    engine = assistantModel();
    const aiText = await claudeReply(input, ctx, category).catch(() => null);
    text = aiText ?? '';
    level = ctx.escalations.length ? 3 : ctx.engineResults.length || input.useMyResult || input.family || input.reportText ? 2 : 1;
    if (category === 'decision_request') actions = ['values_exercise', 'book_counsellor'];
    if (category === 'family' && input.family) actions = ['draft_family_message'];
    if (ctx.engineResults.length && !ctx.engineResults.some((r) => r.escalate)) {
      teachback = { id: 'same_each_pregnancy', correct: 'yes' };
    }
  } else {
    const offline = await offlineDraft(category, input, ctx);
    text = draftText(offline);
    ({ level, actions, teachback, prepSummary } = offline);
  }

  // An X-linked or dominant condition in the user's own family is always a
  // priority escalation, whatever the category (section 4).
  if (category !== 'emergency' && category !== 'distress' && category !== 'injection') {
    const mentioned = findCondition(input.message, input.locale);
    const pattern = mentioned?.inheritance;
    const named = /\b(x-?linked|dominant)\b|مرتبط بالكروموسوم|سائد/iu.test(input.message);
    if ((pattern === 'x_linked' || pattern === 'autosomal_dominant' || named) && (ownFamily.test(input.message) || ownFamily.test(normalise(input.message)))) {
      addEscalation(ctx, 'x_linked_or_dominant', 'priority');
    }
  }

  // Step 2: the output check, on every reply.
  const allowed = ctx.engineResults.flatMap(numbersIn);
  const quoted = input.reportText ? redactReport(input.reportText).split('\n') : [];
  const check = text ? checkReply(text, allowed, quoted) : { ok: false, problems: [] };
  let replaced = false;
  if (!check.ok) {
    replaced = true;
    text = repliesFor(input.locale).fallback;
    level = 3;
    ctx.engineResults.length = 0;
    teachback = undefined;
    addEscalation(ctx, 'outside_library', 'standard');
  }

  const escalation =
    ctx.escalations.find((e) => e.kind === 'emergency') ??
    ctx.escalations.find((e) => e.kind === 'support') ??
    ctx.escalations.find((e) => e.kind === 'counsellor');

  return {
    text,
    category,
    level: escalation ? 3 : level,
    sources: [...ctx.sources.values()],
    risk: ctx.engineResults.at(-1),
    escalation,
    teachback,
    actions: escalation?.kind === 'counsellor' && !actions.includes('book_counsellor') ? [...actions, 'book_counsellor'] : actions,
    prepSummary,
    replaced,
    engine,
  };
}
