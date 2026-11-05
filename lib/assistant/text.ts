/** A condition name inside an English sentence: "Sickle cell disease" → "sickle cell disease" (acronyms kept). */
export function inline(title: string, locale: 'en' | 'ar'): string {
  if (locale !== 'en' || title.length < 2 || title[1] !== title[1].toLowerCase()) return title;
  return title[0].toLowerCase() + title.slice(1);
}
