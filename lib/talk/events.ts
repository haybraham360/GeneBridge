/**
 * Talking-to-family analytics (task 09 section 7). Names and small props
 * only: never message text, never how someone feels.
 */
import { guideIds, tones, type GuideId, type Tone } from './guides';

export type TalkEvent =
  | { name: 'talk_guide_viewed'; props: { guide: GuideId } }
  | { name: 'talk_phrase_copied'; props: { guide: GuideId } }
  | { name: 'talk_draft_tone_used'; props: { tone: Tone } }
  | { name: 'talk_draft_shared'; props: { channel: 'copy' | 'whatsapp' } }
  | { name: 'draft_privacy_warning_shown'; props: Record<string, never> }
  | { name: 'checkin_completed'; props: Record<string, never> }
  | { name: 'talk_counsellor_clicked'; props: Record<string, never> };

/** Events the browser may send to /api/talk/event, validated here. */
export function parseClientEvent(body: unknown): TalkEvent | null {
  if (!body || typeof body !== 'object') return null;
  const { name, guide, channel } = body as Record<string, unknown>;
  const isGuide = typeof guide === 'string' && (guideIds as readonly string[]).includes(guide);
  switch (name) {
    case 'talk_guide_viewed':
    case 'talk_phrase_copied':
      return isGuide ? { name, props: { guide: guide as GuideId } } : null;
    case 'talk_draft_shared':
      return channel === 'copy' || channel === 'whatsapp' ? { name, props: { channel } } : null;
    case 'draft_privacy_warning_shown':
    case 'talk_counsellor_clicked':
      return { name, props: {} };
    default:
      return null;
  }
}

export function isToneEvent(tone: unknown): tone is Tone {
  return typeof tone === 'string' && (tones as readonly string[]).includes(tone);
}
