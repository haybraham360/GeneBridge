/**
 * The four talking-to-family guides (task 09), from the content library
 * (content/library/{en,ar}/talk). Static imports, so no file reads at
 * runtime. Not part of the assistant's library index.
 */
import arFamilyPressure from '@/content/library/ar/talk/family-pressure.json';
import arParents from '@/content/library/ar/talk/parents.json';
import arPartner from '@/content/library/ar/talk/partner.json';
import arRelatives from '@/content/library/ar/talk/relatives.json';
import enFamilyPressure from '@/content/library/en/talk/family-pressure.json';
import enParents from '@/content/library/en/talk/parents.json';
import enPartner from '@/content/library/en/talk/partner.json';
import enRelatives from '@/content/library/en/talk/relatives.json';

export const guideIds = ['partner', 'parents', 'family-pressure', 'relatives'] as const;
export type GuideId = (typeof guideIds)[number];

export const recipients = ['partner', 'parents', 'relatives', 'other'] as const;
export type Recipient = (typeof recipients)[number];

export const tones = ['gentler', 'simpler', 'detail', 'language'] as const;
export type Tone = (typeof tones)[number];

export type TalkLocale = 'en' | 'ar';

export type GuideDrafts = {
  starter: string;
  /** Starter that begins with the partner's first name: `{name}`. */
  starterNamed: string;
  gentler: string;
  simpler: string;
  detail: string;
};

export type Guide = {
  id: GuideId;
  locale: TalkLocale;
  recipient: Recipient;
  label: string;
  title: string;
  intro: string;
  steps: string[];
  phrases: string[];
  drafts: GuideDrafts;
  reviewed: boolean;
  last_checked: string;
};

const all: Record<TalkLocale, Record<GuideId, Guide>> = {
  en: {
    partner: enPartner as Guide,
    parents: enParents as Guide,
    'family-pressure': enFamilyPressure as Guide,
    relatives: enRelatives as Guide,
  },
  ar: {
    partner: arPartner as Guide,
    parents: arParents as Guide,
    'family-pressure': arFamilyPressure as Guide,
    relatives: arRelatives as Guide,
  },
};

export function isGuideId(value: unknown): value is GuideId {
  return typeof value === 'string' && (guideIds as readonly string[]).includes(value);
}

export function isRecipient(value: unknown): value is Recipient {
  return typeof value === 'string' && (recipients as readonly string[]).includes(value);
}

export function isTone(value: unknown): value is Tone {
  return typeof value === 'string' && (tones as readonly string[]).includes(value);
}

export function getGuides(locale: TalkLocale): Guide[] {
  return guideIds.map((id) => all[locale][id]);
}

export function getGuide(id: GuideId, locale: TalkLocale): Guide {
  return all[locale][id];
}

/** The starter message for a guide, with the partner's first name if known. */
export function starterFor(guide: Guide, partnerName: string | null): string {
  return partnerName && guide.id === 'partner'
    ? guide.drafts.starterNamed.replace('{name}', partnerName)
    : guide.drafts.starter;
}

/** What Listen reads: intro, steps and phrases. */
export function guideListenText(guide: Guide): string {
  return [guide.title, guide.intro, ...guide.steps, ...guide.phrases].join(' ');
}
