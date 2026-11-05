import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { MAX_MESSAGE_LENGTH, respond } from '@/lib/assistant/respond';
import type { AssistantLocale, Category, RespondDeps } from '@/lib/assistant/types';
import { takePublicAskSlot } from './server';

/*
 * Public Ask GeneBridge for relatives (task 08 section 3.4). Level 1
 * (Educate) only:
 *   - no access to any personal data: the responder gets no result, no
 *     couple, no family map, no report and no conversation history;
 *   - nothing is stored, and the question is never logged;
 *   - personal, decision and calculation questions get a counsellor
 *     pointer instead of an answer.
 */

const noPersonalData: RespondDeps = {
  getMyResult: async () => null,
  getCouple: async () => null,
};

// Questions that need Level 2 or a person. Answered with a counsellor pointer.
const personalCategories = new Set<Category>([
  'personal_result',
  'risk_question',
  'decision_request',
  'report',
  'family',
  'counselling_prep',
  'asked_for_person',
]);

/*
 * Per-visitor limit, in this server's memory only: a hash of the address
 * with a salt that changes on every restart, kept for an hour, never stored
 * or logged. The database adds a global cap with no identifiers at all.
 */
const PER_VISITOR_PER_HOUR = 15;
const processSalt = randomBytes(16).toString('hex');
const recent = new Map<string, number[]>();

function allowVisitor(address: string): boolean {
  const key = createHash('sha256').update(processSalt).update(address).digest('hex');
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((at) => now - at < 3_600_000);
  if (times.length >= PER_VISITOR_PER_HOUR) {
    recent.set(key, times);
    return false;
  }
  times.push(now);
  recent.set(key, times);
  if (recent.size > 5000) {
    for (const [k, v] of recent) if (!v.some((at) => now - at < 3_600_000)) recent.delete(k);
  }
  return true;
}

export type PublicAnswer =
  | {
      status: 'answered';
      text: string;
      sources: string[];
      /** Show "Talk to a counsellor" with the answer (escalation or personal). */
      counsellor: boolean;
      /** The reply was replaced by the general "ask a counsellor" text. */
      personal: boolean;
    }
  | { status: 'empty' | 'too_long' | 'rate_limited' | 'error' };

export async function publicAnswer(rawQuestion: string, locale: AssistantLocale, address: string): Promise<PublicAnswer> {
  const message = rawQuestion.trim();
  if (!message) return { status: 'empty' };
  if (message.length > MAX_MESSAGE_LENGTH) return { status: 'too_long' };
  if (!allowVisitor(address) || !(await takePublicAskSlot())) return { status: 'rate_limited' };

  try {
    const reply = await respond(
      { message, locale, mode: 'normal', history: [], useMyResult: false, family: null, reportText: null },
      noPersonalData,
    );
    const personal = reply.level === 2 || Boolean(reply.risk) || personalCategories.has(reply.category);
    // Safety replies (emergency, distress) are always shown as written.
    const safety = reply.escalation?.kind === 'emergency' || reply.escalation?.kind === 'support';
    if (personal && !safety) {
      return { status: 'answered', text: '', sources: [], counsellor: true, personal: true };
    }
    return {
      status: 'answered',
      text: reply.text,
      sources: reply.sources.map((s) => s.title),
      counsellor: Boolean(reply.escalation),
      personal: false,
    };
  } catch {
    return { status: 'error' };
  }
}
