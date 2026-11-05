import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import InheritanceSimulator, { type SimCondition } from '@/components/simulator/InheritanceSimulator';
import { routing } from '@/i18n/routing';
import { conditionEntry, listConditions } from '@/lib/conditions/catalogue';
import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/simulator'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'simulator') : {};
}

/**
 * Inheritance simulator (pillar 3). Works for any condition in the catalogue:
 * `?condition=<id>` (from Results, Conditions A–Z and Home) preselects one.
 * The person's own conditions are offered first, but the parents are always
 * example parents: nothing here is set from anyone's result.
 */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/simulator'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { condition } = await searchParams;
  const path = await loadUserPath(await createClient());

  const conditions: SimCondition[] = listConditions(locale).map((c) => {
    const entry = conditionEntry(c.id, locale);
    return {
      id: c.id,
      title: c.title,
      aliases: c.aliases,
      gene: c.gene,
      inheritance: c.inheritance,
      diseaseLabel: entry?.disease_label ?? c.title,
      inheritancePlain: entry?.inheritance_plain ?? '',
    };
  });
  const known = new Set(conditions.map((c) => c.id));

  const mine: { id: string; tag: 'result' | 'following' }[] = [];
  for (const f of path.findings) {
    if (f.status !== 'no_variant' && known.has(f.conditionId)) mine.push({ id: f.conditionId, tag: 'result' });
  }
  for (const f of path.followed) {
    if (known.has(f.conditionId) && !mine.some((m) => m.id === f.conditionId)) mine.push({ id: f.conditionId, tag: 'following' });
  }

  const initial = typeof condition === 'string' && known.has(condition) ? condition : null;
  return <InheritanceSimulator conditions={conditions} mine={mine} initialConditionId={initial} />;
}
