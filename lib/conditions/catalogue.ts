/**
 * The condition catalogue for pickers and personalised pages (task 11), from
 * the content library. Condition names, patterns and questions always come
 * from here, never from components.
 */
import { allEntries, getEntry, type LibraryEntry } from '@/lib/assistant/library';
import type { AssistantLocale } from '@/lib/assistant/types';
import type { CatalogueCondition } from './search';

export { searchConditions, type CatalogueCondition } from './search';

function toCondition(entry: LibraryEntry): CatalogueCondition {
  return {
    id: entry.id,
    title: entry.title,
    aliases: entry.aliases,
    inheritance: entry.inheritance ?? null,
    suggestedQuestions: entry.suggested_questions ?? [],
    gene: entry.gene ?? null,
    area: entry.area ?? 'other',
    cardSummary: entry.card_summary ?? entry.summary,
    featured: entry.featured ?? false,
  };
}

export function listConditions(locale: AssistantLocale): CatalogueCondition[] {
  return allEntries(locale)
    .filter((e) => e.kind === 'condition')
    .map(toCondition)
    .sort((a, b) => a.title.localeCompare(b.title, locale));
}

export function getCondition(id: string, locale: AssistantLocale): CatalogueCondition | null {
  const entry = getEntry(id, locale);
  return entry && entry.kind === 'condition' ? toCondition(entry) : null;
}

export function isConditionId(id: unknown): id is string {
  return typeof id === 'string' && getEntry(id, 'en')?.kind === 'condition';
}

/** The full library entry for a condition guide page. */
export function conditionEntry(id: string, locale: AssistantLocale): LibraryEntry | null {
  const entry = getEntry(id, locale);
  return entry && entry.kind === 'condition' ? entry : null;
}
