/**
 * The reviewed content library (content/library). The assistant's only
 * source of facts: it never searches the web.
 */
import { rawEntries } from './libraryIndex';
import type { AssistantLocale, SourceChip } from './types';

export type LibraryOption = {
  name: string;
  involves: string;
  timeline: string;
  cost: string;
  questions: string[];
};

export type LibraryEntry = {
  id: string;
  kind: 'condition' | 'general';
  locale: AssistantLocale;
  inheritance?: 'autosomal_recessive' | 'autosomal_dominant' | 'x_linked' | 'complex';
  title: string;
  aliases: string[];
  summary: string;
  inheritance_plain?: string;
  carrier_meaning?: string;
  disease_meaning?: string;
  screening?: string;
  body?: string;
  options?: LibraryOption[];
  sources: { title: string; publisher: string; url: string }[];
  /** Conditions: 3 questions people often ask (task 11, exploring Home). */
  suggested_questions?: string[];
  /** Conditions (design refresh): gene, body area, card text, care, counsellor questions. */
  gene?: string;
  area?: 'blood' | 'nerves_muscles' | 'hearing_vision' | 'metabolic' | 'heart' | 'other';
  card_summary?: string;
  /** Results page (task 10): carrier and condition names, one line each. */
  carrier_label?: string;
  disease_label?: string;
  carrier_short?: string;
  disease_short?: string;
  care?: string;
  counsellor_questions?: string[];
  reviewed: boolean;
  last_checked: string;
};

const entries: Record<AssistantLocale, LibraryEntry[]> = {
  en: rawEntries.en as unknown as LibraryEntry[],
  ar: rawEntries.ar as unknown as LibraryEntry[],
};

export function allEntries(locale: AssistantLocale): LibraryEntry[] {
  return entries[locale];
}

export function getEntry(id: string, locale: AssistantLocale): LibraryEntry | null {
  return entries[locale].find((e) => e.id === id) ?? null;
}

/** Lower-case, strip Arabic diacritics and unify common letter forms. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(entry: LibraryEntry, text: string): number {
  let best = 0;
  for (const term of [entry.title, ...entry.aliases]) {
    const t = normalise(term);
    if (!t) continue;
    // Whole-word-ish match; longer, more specific terms score higher.
    // Arabic words can carry a joined prefix (و، ف، ب، ل، ك, as in "بالثلاسيميا").
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|\\s)[وفبلك]{0,2}${escaped}(\\s|$)`, 'u');
    if (pattern.test(text)) best = Math.max(best, t.length + (entry.kind === 'condition' ? 5 : 0));
  }
  return best;
}

/**
 * The most relevant entries for a question, best first. Searches both
 * languages' aliases (people mix languages) and returns entries in `locale`.
 */
export function findEntries(question: string, locale: AssistantLocale, limit = 2): LibraryEntry[] {
  const text = normalise(question);
  const scored = new Map<string, number>();
  for (const loc of ['en', 'ar'] as const) {
    for (const entry of entries[loc]) {
      const s = score(entry, text);
      if (s > 0) scored.set(entry.id, Math.max(scored.get(entry.id) ?? 0, s));
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => getEntry(id, locale))
    .filter((e): e is LibraryEntry => e !== null);
}

/** Conditions only. */
export function findCondition(question: string, locale: AssistantLocale): LibraryEntry | null {
  return findEntries(question, locale, 5).find((e) => e.kind === 'condition') ?? null;
}

export function chip(entry: LibraryEntry): SourceChip {
  return { id: entry.id, title: entry.title };
}

/** The library entry for a condition code stored on a result (e.g. 'sickle_cell'). */
export function entryForConditionCode(code: string, locale: AssistantLocale): LibraryEntry | null {
  const id = code === 'sickle_cell' ? 'sickle_cell_disease' : code;
  return getEntry(id, locale);
}
