import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConditionsList } from '@/components/conditions/ConditionsList';
import { ListenPill } from '@/components/ui/ListenPill';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { listConditions } from '@/lib/conditions/catalogue';
import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/conditions'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'conditions.meta' });
  return { title: t('title') };
}

/** Conditions A–Z (design Conditions): every guide comes from the content library. */
export default async function ConditionsPage({ params }: PageProps<'/[locale]/dashboard/conditions'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, path] = await Promise.all([getTranslations({ locale, namespace: 'conditions' }), loadUserPath(await createClient())]);
  const conditions = listConditions(locale);

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('list.title')}</h1>
          <p className="text-[15px] text-muted">{t('list.subtitle')}</p>
        </div>
        <ListenPill
          text={[t('list.title'), t('list.subtitle'), ...conditions.map((c) => `${c.title}. ${c.cardSummary}`)].join(' ')}
          play={t('listen')}
          stop={t('stop')}
        />
      </header>
      <p className="mt-6 flex items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px]">
        <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
        {t('list.draft')}
      </p>
      <div className="mt-6">
        <ConditionsList
          conditions={conditions}
          inResults={path.findings.map((f) => f.conditionId)}
          following={path.followed.map((f) => f.conditionId)}
        />
      </div>
      <p className="mt-8 text-[15px] text-muted">
        {t.rich('list.footer', {
          ask: (chunks) => (
            <Link href="/dashboard/assistant" className="font-bold text-brand-text underline underline-offset-2">
              {chunks}
            </Link>
          ),
          counsellor: (chunks) => (
            <Link href="/dashboard/counsellor" className="font-bold text-brand-text underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </main>
  );
}
