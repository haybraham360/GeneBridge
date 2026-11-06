/**
 * The describe pipeline's wire formats (task 13, section 4), checked with
 * zod on both sides:
 *   - the six tool inputs the model may produce (and the rule-based
 *     planner produces too);
 *   - the request the browser sends: masked text and a compact tree with
 *     no names or labels;
 *   - the changes streamed back.
 */
import { z } from 'zod';
import { relations } from '../relations';
import { conditionStatuses, linkTypes, sexes, sides, MAX_DESCRIBE_CHARS, MAX_PEOPLE } from '../types';
import type { Link, Member, MemberCondition } from '../types';

export const TOKEN_RE = /^\[PERSON_\d{1,2}\]$/;
const ref = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const token = z.string().regex(TOKEN_RE);
const addableRelations = relations.filter((r) => r !== 'self') as [string, ...string[]];

/* ------------------------------- Tool inputs ------------------------------ */

export const addPersonInput = z.strictObject({
  temp_id: z.string().min(1).max(24).regex(/^[A-Za-z0-9_-]+$/),
  relation_hint: z.enum(addableRelations),
  side: z.enum(sides),
  sex: z.enum(sexes),
  generation: z.number().int().min(-4).max(4),
  label_token: token.nullable(),
});

export const addLinkInput = z.strictObject({
  from: ref,
  to: ref,
  type: z.enum(linkTypes),
  consanguineous: z.boolean(),
});

export const addConditionInput = z.strictObject({
  person: ref,
  condition_query: z.string().min(1).max(120),
  status: z.enum(conditionStatuses),
});

export const updatePersonInput = z.strictObject({
  id: ref,
  fields: z.strictObject({
    relation_hint: z.enum(addableRelations).nullable(),
    side: z.enum(sides).nullable(),
    sex: z.enum(sexes).nullable(),
    label_token: token.nullable(),
    deceased: z.boolean().nullable(),
  }),
});

export const askUserInput = z.strictObject({
  question: z.string().min(1).max(220),
  choices: z.array(z.string().min(1).max(40)).min(2).max(4),
});

export const doneInput = z.strictObject({ summary: z.string().max(400) });

export type AddPerson = z.infer<typeof addPersonInput>;
export type AddLink = z.infer<typeof addLinkInput>;
export type AddCondition = z.infer<typeof addConditionInput>;
export type UpdatePerson = z.infer<typeof updatePersonInput>;
export type AskUser = z.infer<typeof askUserInput>;

export type Op =
  | { tool: 'add_person'; input: AddPerson }
  | { tool: 'add_link'; input: AddLink }
  | { tool: 'add_condition'; input: AddCondition }
  | { tool: 'update_person'; input: UpdatePerson }
  | { tool: 'ask_user'; input: AskUser }
  | { tool: 'done'; input: { summary: string } };

export const toolNames = ['add_person', 'add_link', 'add_condition', 'update_person', 'ask_user', 'done'] as const;
export type ToolName = (typeof toolNames)[number];

const inputSchemas: Record<ToolName, z.ZodType> = {
  add_person: addPersonInput,
  add_link: addLinkInput,
  add_condition: addConditionInput,
  update_person: updatePersonInput,
  ask_user: askUserInput,
  done: doneInput,
};

/** Checks one tool call. Anything that doesn't match exactly is rejected, never coerced. */
export function parseOp(name: string, input: unknown): { op: Op } | { error: string } {
  if (!(toolNames as readonly string[]).includes(name)) return { error: `Unknown tool ${name}.` };
  const parsed = inputSchemas[name as ToolName].safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}` };
  return { op: { tool: name, input: parsed.data } as Op };
}

/* ------------------------------ Request body ------------------------------ */

export const compactMember = z.strictObject({
  id: ref,
  relation: z.enum(relations as [string, ...string[]]),
  side: z.enum(sides),
  sex: z.enum(sexes),
  generation: z.number().int().min(-6).max(6),
  token: token.nullable(),
  owner: z.boolean(),
  placeholder: z.boolean(),
  proposed: z.boolean(),
  deceased: z.boolean(),
});

export const compactLink = z.strictObject({
  id: ref,
  from: ref,
  to: ref,
  type: z.enum(linkTypes),
  consanguineous: z.boolean(),
});

export const compactCondition = z.strictObject({
  id: ref,
  member: ref,
  /** A catalogue id, or "other" (the words are never sent back). */
  condition: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
  status: z.enum(conditionStatuses),
});

export const compactTree = z.strictObject({
  members: z.array(compactMember).max(MAX_PEOPLE),
  links: z.array(compactLink).max(MAX_PEOPLE * 4),
  conditions: z.array(compactCondition).max(MAX_PEOPLE * 6),
});

export type CompactTree = z.infer<typeof compactTree>;

export const describeRequest = z.strictObject({
  /** Already masked in the browser: names are [PERSON_n]. */
  text: z.string().trim().min(1).max(MAX_DESCRIBE_CHARS),
  locale: z.enum(['en', 'ar']),
  input: z.enum(['voice', 'text']),
  kind: z.enum(['describe', 'answer']),
  tree: compactTree,
  /** Earlier turns this session, masked: the person's words and GeneBridge's questions. */
  history: z
    .array(z.strictObject({ role: z.enum(['user', 'assistant']), text: z.string().max(MAX_DESCRIBE_CHARS + 300) }))
    .max(8),
});

export type DescribeRequest = z.infer<typeof describeRequest>;

/* ----------------------------- Streamed changes ---------------------------- */

export type Question =
  | { id: string; kind: 'model'; text: string; choices: string[] }
  | {
      id: string;
      /** Our catalogue matcher's suggestion ("Do you mean …?"), never the model's. */
      kind: 'condition_match';
      memberId: string;
      conditionRowId: string;
      candidates: string[];
      /** The status to use once the person confirms the name. */
      statedStatus: MemberCondition['status'];
    };

export type Change =
  | { kind: 'member'; member: Member; token: string | null }
  | { kind: 'link'; link: Link }
  | { kind: 'condition'; condition: MemberCondition }
  | { kind: 'remove'; what: 'member' | 'link' | 'condition'; id: string }
  | { kind: 'question'; question: Question };

export type TurnSummary = {
  people: number;
  links: number;
  conditions: number;
  questions: number;
  consanguinity: number;
  placeholders: number;
  rejected: number;
  seconds: number;
  /** The planner that ran: the model, or the rule-based offline planner. */
  planner: 'model' | 'rules';
};
