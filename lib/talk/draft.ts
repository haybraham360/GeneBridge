/**
 * Message drafter rewrites (task 09). With AI mode on, the drafting-mode
 * prompt rewrites the person's own draft; every rewrite is checked
 * (draftCheck.ts) and falls back to the guide's fixed wording if it fails.
 * Without an API key, the fixed wording per guide and tone is used
 * directly (content/library/{locale}/talk). Not server-only, so the eval
 * can run it.
 */
import { aiEnabled, draftWithModel } from '@/lib/assistant/claude';
import { getEntry } from '@/lib/assistant/library';
import { checkDraft, type DraftProblem } from './draftCheck';
import { getGuide, type GuideId, type Recipient, type TalkLocale, type Tone } from './guides';

export const MAX_DRAFT_INPUT = 1000;

export type RewriteInput = {
  text: string;
  tone: Tone;
  guide: GuideId;
  recipient: Recipient;
  /** The language of the result. For "language" it's the other language. */
  locale: TalkLocale;
};

export type RewriteResult = {
  text: string;
  /** 'template' when the guide's fixed wording was used. */
  engine: 'ai' | 'template';
  /** Problems found in the model's rewrite, if it was replaced. */
  problems: DraftProblem[];
};

function template(input: RewriteInput): string {
  const guide = getGuide(input.guide, input.locale);
  return input.tone === 'language' ? guide.drafts.starter : guide.drafts[input.tone];
}

/** Only the library's carrier facts may be added (never anything else). */
function facts(locale: TalkLocale): string {
  const carrier = getEntry('what_is_a_carrier', locale);
  return carrier ? [carrier.summary, carrier.body].filter(Boolean).join(' ') : '';
}

export async function rewriteDraft(input: RewriteInput, { offline = false } = {}): Promise<RewriteResult> {
  if (offline || !aiEnabled()) return { text: template(input), engine: 'template', problems: [] };

  const user = [
    `<tone>${input.tone}</tone>`,
    `<language>${input.locale === 'ar' ? 'Arabic' : 'English'}</language>`,
    `<recipient>${input.recipient}</recipient>`,
    `<facts>${facts(input.locale)}</facts>`,
    `<draft>${input.text.slice(0, MAX_DRAFT_INPUT)}</draft>`,
  ].join('\n');

  const rewrite = await draftWithModel(user).catch(() => null);
  const cleaned = rewrite?.replace(/^["“”«»]+|["“”«»]+$/gu, '').trim() ?? '';
  const problems = cleaned ? checkDraft(cleaned, input.text, input.locale) : ['unsafe' as const];
  if (problems.length) return { text: template(input), engine: 'template', problems };
  return { text: cleaned, engine: 'ai', problems: [] };
}
