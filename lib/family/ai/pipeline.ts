import 'server-only';
/**
 * One "Describe your family" turn (task 13, section 4), server side:
 *   1. the browser has already masked names; any listed name that slipped
 *      through is replaced with [NAME] before anything else;
 *   2. the assistant's safety check (task 06) and a family-specific check
 *      catch prompt injection: an injected turn changes nothing;
 *   3. the planner (Claude with tools, or the rule-based planner) produces
 *      operations, each checked with zod and lib/family/validate.ts and
 *      matched to the catalogue (apply.ts);
 *   4. changes are streamed back as proposals. Nothing is saved here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { classifyByRules } from '@/lib/assistant/classify';
import { findNames } from '../mask';
import { applyOp, createContext, finishTurn, turnCounts } from './apply';
import { familyAiEnabled, ModelRefusal, runModelTurn } from './claude';
import { forModel, fromCompact } from './compact';
import { offTopicQuestion, planWithRules } from './rules';
import { parseOp, type Change, type DescribeRequest, type Op, type TurnSummary } from './schema';

const FAMILY_INJECTION =
  /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(instructions?|rules?|prompt|guidelines?)\b|\badd\s+\d{2,}\s+(people|persons|relatives|members)\b|\b(system|developer)\s+(prompt|message|mode)\b|\byou are now\b|تجاهل[^.]{0,30}(التعليمات|القواعد|الأوامر|الاوامر)|أضف\s+\d{2,}\s+(شخص|أشخاص)/iu;

export function isInjection(text: string): boolean {
  return FAMILY_INJECTION.test(text) || classifyByRules(text) === 'injection';
}

/** Belt and braces: a listed name the browser missed never reaches the model. */
export function scrubNames(text: string): string {
  // Tokens are blanked (same length, so positions hold) so they aren't read as names.
  const found = findNames(text.replace(/\[PERSON_\d{1,2}\]/g, (t) => ' '.repeat(t.length)));
  let out = '';
  let at = 0;
  for (const n of found) {
    out += text.slice(at, n.start) + '[NAME]';
    at = n.end;
  }
  return out + text.slice(at);
}

export function plannerKind(): 'model' | 'rules' {
  if (process.env.NODE_ENV !== 'production' && process.env.FAMILY_TEST_PLANNER === '1') return 'rules';
  return familyAiEnabled() ? 'model' : 'rules';
}

export function buildUserContent(req: DescribeRequest, text: string, history: DescribeRequest['history']): string {
  return [
    `<locale>${req.locale}</locale>`,
    `<turn>${req.kind === 'answer' ? 'answer to your earlier question' : 'new description'}</turn>`,
    `<tree>${JSON.stringify(forModel(req.tree))}</tree>`,
    history.length
      ? `<history>${history.map((h) => `<${h.role === 'user' ? 'person' : 'genebridge'}>${h.text}</${h.role === 'user' ? 'person' : 'genebridge'}>`).join('')}</history>`
      : '<history></history>',
    `<description>${text}</description>`,
  ].join('\n');
}

export type DescribeOptions = {
  emit: (change: Change) => void;
  planner?: 'model' | 'rules';
  signal?: AbortSignal;
  onRequest?: (body: unknown) => void;
  uuid?: () => string;
};

export async function runDescribe(req: DescribeRequest, opts: DescribeOptions): Promise<TurnSummary> {
  const startedAt = Date.now();
  const planner = opts.planner ?? plannerKind();
  const { tree, tokens } = fromCompact(req.tree);
  const ctx = createContext(tree, tokens, opts.emit, opts.uuid);
  const text = scrubNames(req.text);
  const history = req.history.map((h) => ({ ...h, text: scrubNames(h.text) }));

  const run = (op: Op) => applyOp(ctx, op);

  if (isInjection(text)) {
    // Instructions inside a description have no effect: nothing is added.
    run(offTopicQuestion(/[؀-ۿ]/u.test(text) ? 'ar' : req.locale));
  } else if (planner === 'rules') {
    for (const op of planWithRules({ text, locale: req.locale, kind: req.kind, tree: req.tree, history })) run(op);
  } else {
    let applied = 0;
    try {
      await runModelTurn({
        userContent: buildUserContent(req, text, history),
        signal: opts.signal,
        onRequest: opts.onRequest,
        isDone: () => ctx.done,
        onToolUse: (name, input) => {
          applied += 1;
          const parsed = parseOp(name, input);
          if ('error' in parsed) {
            ctx.rejected += 1;
            return { ok: false, error: parsed.error };
          }
          return run(parsed.op);
        },
      });
    } catch (error) {
      // The AI service is unreachable (or out of credit) before anything happened:
      // fall back to the rule-based planner so the person can still build their tree.
      const unreachable =
        error instanceof Anthropic.APIConnectionError ||
        (error instanceof Anthropic.APIError &&
          (error.status === undefined || error.status >= 500 || [401, 403, 429, 529].includes(error.status) || /credit balance|billing/i.test(error.message)));
      // A bad request of our own, a refusal or a cancelled turn is not hidden behind the fallback.
      if (opts.signal?.aborted || applied > 0 || !unreachable || error instanceof ModelRefusal) throw error;
      console.warn('family model unavailable, using rules', error.status ?? '');
      for (const op of planWithRules({ text, locale: req.locale, kind: req.kind, tree: req.tree, history })) run(op);
      finishTurn(ctx);
      return { ...turnCounts(ctx), seconds: Math.round((Date.now() - startedAt) / 100) / 10, planner: 'rules' };
    }
  }
  finishTurn(ctx);
  return { ...turnCounts(ctx), seconds: Math.round((Date.now() - startedAt) / 100) / 10, planner };
}
