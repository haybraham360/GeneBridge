/**
 * The four tools Ask GeneBridge can call (task 06, section 2). Every fact
 * and number comes from these, never from the model. Shared by the AI
 * responder (as tool definitions) and the offline responder (called
 * directly), so both give the same answers.
 */
import {
  calculateInheritance,
  InheritanceInputError,
  parentStatuses,
  patterns,
  type InheritanceResult,
} from '@/lib/genetics/inheritance';
import { allEntries, chip, entryForConditionCode, getEntry } from './library';
import type {
  AssistantLocale,
  CoupleSummary,
  Escalation,
  EscalationTrigger,
  RespondDeps,
  ResultSummary,
  SourceChip,
} from './types';

/** What one turn's tool calls produced. Read by the output check and the UI. */
export type ToolContext = {
  locale: AssistantLocale;
  useMyResult: boolean;
  deps: RespondDeps;
  engineResults: InheritanceResult[];
  escalations: Escalation[];
  sources: Map<string, SourceChip>;
  /** Set once get_my_result_summary ran; null when nothing was shared. */
  result?: ResultSummary | null;
  couple?: CoupleSummary | null;
};

export function newToolContext(
  locale: AssistantLocale,
  useMyResult: boolean,
  deps: RespondDeps,
): ToolContext {
  return { locale, useMyResult, deps, engineResults: [], escalations: [], sources: new Map() };
}

const conditionIds = allEntries('en')
  .filter((e) => e.kind === 'condition')
  .map((e) => e.id);
const generalIds = allEntries('en')
  .filter((e) => e.kind === 'general')
  .map((e) => e.id);

const triggers: EscalationTrigger[] = [
  'flagged_result',
  'pregnancy',
  'x_linked_or_dominant',
  'major_decision',
  'outside_library',
  'distress',
  'asked_for_person',
];

/** Tool definitions in the Messages API shape (strict schemas). */
export const toolDefinitions = [
  {
    name: 'get_condition_info',
    description:
      'Read one entry from the GeneBridge content library: a condition or a general topic. This is the only source of facts. Use it before explaining any condition or topic, and cite its title.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        condition_id: { type: 'string', enum: [...conditionIds, ...generalIds] },
      },
      required: ['condition_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'calculate_inheritance',
    description:
      'The deterministic inheritance engine. Returns the chances for each pregnancy (affected / carrier / unaffected, in whole percentages). Call it for every risk number you mention; never state a number it did not return. For x_linked, parent1 is the mother and parent2 the father. Dominant and X-linked results must be followed by escalate_to_counsellor.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', enum: [...patterns] },
        parent1: { type: 'string', enum: [...parentStatuses] },
        parent2: { type: 'string', enum: [...parentStatuses] },
      },
      required: ['pattern', 'parent1', 'parent2'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_result_summary',
    description:
      "The user's own result summary (condition and carrier status), plus their partner's status for the same condition when both partners consented to the couple view. Only available when the user turned on \"Use my result in this chat\". If it returns escalate: true, the result is flagged: give no explanation or numbers about it and call escalate_to_counsellor with flagged_result.",
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'escalate_to_counsellor',
    description:
      'Show the user a card that connects them to a qualified genetic counsellor. Use for: a flagged result, a current pregnancy, an X-linked or dominant pattern in their family, a request to confirm a major decision, anything outside the library, distress, or when they ask for a person. Always explain what you safely can first.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', enum: triggers },
        urgency: { type: 'string', enum: ['standard', 'priority'] },
      },
      required: ['reason', 'urgency'],
      additionalProperties: false,
    },
  },
];

/**
 * Priority triggers can't be downgraded by the model. X-linked or dominant
 * is priority only when it applies to the user's own family, so the caller
 * sets its urgency.
 */
const priorityTriggers: ReadonlySet<EscalationTrigger> = new Set([
  'flagged_result',
  'pregnancy',
  'distress',
]);

export function addEscalation(ctx: ToolContext, trigger: EscalationTrigger, urgency: 'standard' | 'priority') {
  const finalUrgency = priorityTriggers.has(trigger) ? 'priority' : urgency;
  const existing = ctx.escalations.find((e) => e.kind === 'counsellor');
  if (existing && existing.kind === 'counsellor') {
    // Keep the most urgent one.
    if (existing.urgency === 'standard' && finalUrgency === 'priority') {
      ctx.escalations.splice(ctx.escalations.indexOf(existing), 1);
    } else {
      return;
    }
  }
  ctx.escalations.push({ kind: 'counsellor', trigger, urgency: finalUrgency });
}

export async function loadMyResult(ctx: ToolContext): Promise<ResultSummary | null> {
  if (!ctx.useMyResult) return null;
  if (ctx.result === undefined) {
    ctx.result = await ctx.deps.getMyResult();
    ctx.couple = ctx.result && !ctx.result.escalate ? await ctx.deps.getCouple() : null;
  }
  return ctx.result;
}

/** Runs one tool. Returns a JSON-serialisable result for the model. */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'get_condition_info': {
      const entry = getEntry(String(args.condition_id), ctx.locale);
      if (!entry) return { error: 'not_in_library' };
      ctx.sources.set(entry.id, chip(entry));
      const { reviewed, last_checked, aliases, audio, locale, ...facts } = entry as typeof entry & {
        audio?: string;
      };
      void reviewed;
      void last_checked;
      void aliases;
      void audio;
      void locale;
      return facts;
    }
    case 'calculate_inheritance': {
      try {
        const result = calculateInheritance(
          args.pattern as never,
          args.parent1 as never,
          args.parent2 as never,
        );
        ctx.engineResults.push(result);
        return result;
      } catch (error) {
        if (error instanceof InheritanceInputError) return { error: error.message };
        throw error;
      }
    }
    case 'get_my_result_summary': {
      if (!ctx.useMyResult) return { error: 'not_shared', note: 'The user has not turned on "Use my result in this chat".' };
      const result = await loadMyResult(ctx);
      if (!result) return { error: 'no_result' };
      if (result.escalate) {
        addEscalation(ctx, 'flagged_result', 'priority');
        return { escalate: true };
      }
      const entry = entryForConditionCode(result.condition, ctx.locale);
      if (entry) ctx.sources.set(entry.id, chip(entry));
      return {
        condition: entry?.title ?? result.condition,
        condition_id: entry?.id ?? result.condition,
        status: result.status,
        partner: ctx.couple
          ? { first_name: ctx.couple.partnerName, status: ctx.couple.partnerStatus }
          : 'not_shared',
      };
    }
    case 'escalate_to_counsellor': {
      const reason = triggers.includes(args.reason as EscalationTrigger)
        ? (args.reason as EscalationTrigger)
        : 'outside_library';
      addEscalation(ctx, reason, args.urgency === 'priority' ? 'priority' : 'standard');
      return { shown: true };
    }
    default:
      return { error: 'unknown_tool' };
  }
}
