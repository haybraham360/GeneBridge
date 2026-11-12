import { getCondition } from '@/lib/conditions/catalogue';
import { loadHomeSummary } from '@/lib/home/summary';
import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import OptionsPage from '@/components/options/OptionsPage';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/options'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'options') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard/options'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // The couple's shared condition, only once both agreed (from their own data).
  const supabase = await createClient();
  const summary = await loadHomeSummary(supabase, await loadUserPath(supabase));
  const shared = summary.couple.kind === 'shared' ? summary.couple.sharedConditionIds[0] : null;
  const sharedCondition = shared ? (getCondition(shared, locale)?.title ?? null) : null;
  return <OptionsPage sharedCondition={sharedCondition} />;
}
