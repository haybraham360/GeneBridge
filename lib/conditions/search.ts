/**
 * Condition search for pickers in the browser (task 11). Deliberately has no
 * imports, so client components don't bundle the content library; the
 * page passes the catalogue in.
 */
export type CatalogueCondition = {
  id: string;
  title: string;
  aliases: string[];
  inheritance: 'autosomal_recessive' | 'autosomal_dominant' | 'x_linked' | 'complex' | null;
  suggestedQuestions: string[];
  gene: string | null;
  area: 'blood' | 'nerves_muscles' | 'hearing_vision' | 'metabolic' | 'heart' | 'other';
  cardSummary: string;
  featured: boolean;
};

export const conditionAreas = ['blood', 'nerves_muscles', 'hearing_vision', 'metabolic', 'heart', 'other'] as const;
export const conditionPatterns = ['autosomal_recessive', 'autosomal_dominant', 'x_linked'] as const;

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name or alias search (genes such as GJB2 and HbAS are aliases). */
export function searchConditions<T extends Pick<CatalogueCondition, 'title' | 'aliases'>>(query: string, conditions: T[]): T[] {
  const q = fold(query);
  if (!q) return conditions;
  return conditions.filter((c) => [c.title, ...c.aliases].some((name) => fold(name).includes(q)));
}
