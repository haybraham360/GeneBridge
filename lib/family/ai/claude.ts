import 'server-only';
/**
 * The model planner for "Describe your family" (task 13, section 4 step 3).
 * A Claude model (FAMILY_MODEL, default claude-opus-5-5) with the six
 * family tools only. The response is streamed and each tool call is
 * checked and applied the moment it is complete, so people appear one by
 * one. The request holds masked text and a tree without names; `onRequest`
 * lets the eval check that.
 */
import Anthropic from '@anthropic-ai/sdk';
import { familySystemPrompt } from './prompt';
import { familyTools } from './tools';

export function familyModel(): string {
  return process.env.FAMILY_MODEL || 'claude-opus-5-5';
}

export function familyAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Effort = 'low' | 'medium' | 'high';
function familyEffort(): Effort {
  const e = process.env.FAMILY_EFFORT;
  return e === 'medium' || e === 'high' ? e : 'low';
}

/** Models that accept the server-side refusal fallback. */
const fallbackModels = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class ModelRefusal extends Error {}

export type ToolHandler = (name: string, input: unknown) => { ok: true; note?: string } | { ok: false; error: string };

export type ModelTurnInput = {
  userContent: string;
  onToolUse: ToolHandler;
  /** True once the planner has called `done`. */
  isDone: () => boolean;
  signal?: AbortSignal;
  /** Called with every request body before it is sent (the eval checks it holds no names). */
  onRequest?: (body: unknown) => void;
};

const MAX_ROUNDS = 3;

export async function runModelTurn({ userContent, onToolUse, isDone, signal, onRequest }: ModelTurnInput): Promise<void> {
  const model = familyModel();
  const tools = familyTools.map((t, i) =>
    i === familyTools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t,
  ) as unknown as Anthropic.Beta.BetaTool[];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: userContent }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body = {
      model,
      max_tokens: 8000,
      system: [{ type: 'text' as const, text: familySystemPrompt, cache_control: { type: 'ephemeral' as const } }],
      tools,
      tool_choice: { type: 'auto' as const },
      output_config: { effort: familyEffort() },
      messages,
      ...(fallbackModels.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    };
    onRequest?.(body);

    const results = new Map<string, Anthropic.Beta.BetaToolResultBlockParam>();
    const handle = (block: Anthropic.Beta.BetaToolUseBlock) => {
      if (results.has(block.id)) return;
      const out = onToolUse(block.name, block.input);
      results.set(block.id, {
        type: 'tool_result',
        tool_use_id: block.id,
        ...(out.ok ? { content: out.note ?? 'ok' } : { content: out.error, is_error: true }),
      });
    };

    const stream = anthropic().beta.messages.stream(body as Anthropic.Beta.MessageCreateParamsStreaming, { signal });
    // Apply each tool call as soon as its block is complete.
    stream.on('contentBlock', (block) => {
      if (block.type === 'tool_use') handle(block);
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') throw new ModelRefusal('refused');
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    for (const use of uses) handle(use);

    const failed = [...results.values()].some((r) => r.is_error);
    if (uses.length === 0 || message.stop_reason !== 'tool_use' || (isDone() && !failed)) return;

    messages.push({ role: 'assistant', content: message.content });
    messages.push({ role: 'user', content: uses.map((u) => results.get(u.id)!) });
  }
}
