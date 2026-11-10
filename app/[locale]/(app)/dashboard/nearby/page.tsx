import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NearbyFinder } from '@/components/nearby/NearbyFinder';
import { emergencyNumber } from '@/config/support-resources';
import { routing } from '@/i18n/routing';
import { logEvents } from '@/lib/auth/events';
import { createClient, getAuthUser } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/nearby'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'nearby.meta' });
  return { title: t('title') };
}

const sources = ['directory', 'services', 'handoff', 'tracker'] as const;

/**
 * Care near you (docs/nearby-care.md): verified professionals and services
 * near a chosen area or the person's approximate location. Nothing about
 * where the person is is stored. `?from=` records which page they came from.
 */
export default async function NearbyPage({ params, searchParams }: PageProps<'/[locale]/dashboard/nearby'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { from } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'nearby' });

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (user) {
    const source = sources.find((s) => s === from) ?? 'direct';
    await logEvents(supabase, user.id, [{ name: 'nearby_opened', props: { source } }]);
  }

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </header>
      <p className="mt-6 flex items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px]">
        <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
        {t('placeholder')}
      </p>
      <div className="mt-6">
        <NearbyFinder emergencyNumber={emergencyNumber} />
      </div>
    </main>
  );
}
