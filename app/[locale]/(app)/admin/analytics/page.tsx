import { Download } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { routing } from '@/i18n/routing';
import { showSyntheticLabel } from '@/lib/analytics/demo';
import { filtersQuery, parseFilters } from '@/lib/analytics/filters';
import { isAnalyst, loadCentres } from '@/lib/analytics/queries';
import { createClient } from '@/lib/supabase/server';
import { AnalyticsSidebar } from './components/AnalyticsSidebar';
import { DashboardBody } from './components/DashboardBody';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { FilterBar } from './components/FilterBar';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/analytics'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'analytics.meta' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * Health authority dashboard (task 05, M8). Analysts only: the proxy already
 * returns 404 for everyone else, and this checks again. All figures are
 * aggregates from database functions that hide groups under 10.
 */
export default async function AnalyticsPage({
  params,
  searchParams,
}: PageProps<'/[locale]/admin/analytics'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const supabase = await createClient();
  if (!(await isAnalyst(supabase))) notFound();

  const [t, centres, synthetic] = await Promise.all([
    getTranslations({ locale, namespace: 'analytics' }),
    loadCentres(supabase).catch(() => [] as string[]),
    showSyntheticLabel(),
  ]);
  const filters = parseFilters(await searchParams, centres);
  const query = filtersQuery(filters);

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <AnalyticsSidebar />

      <main
        id="main"
        className="flex min-w-0 flex-1 flex-col gap-6 px-[clamp(16px,3vw,40px)] pt-8 pb-12"
      >
        <header id="overview" className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">
              {t('header.title')}
            </h1>
            <p className="text-[15px] text-muted">
              {synthetic ? (
                <>
                  <strong className="font-bold text-brand-text-dark">{t('header.synthetic')}</strong>
                  {' · '}
                </>
              ) : null}
              {t('header.subtitle')}
            </p>
          </div>

          <div role="group" aria-label={t('filters.label')} className="flex flex-wrap items-center gap-3">
            <FilterBar filters={filters} centres={centres} />
            <a
              id="export"
              // A plain link: the route handler streams the CSV as a download.
              href={`/${locale}/admin/analytics/export${query}`}
              download
              title={t('filters.exportHint')}
              className={buttonClasses('ghost')}
            >
              <Download aria-hidden="true" className="size-5" strokeWidth={2} />
              {t('filters.export')}
            </a>
          </div>
        </header>

        <Suspense key={query} fallback={<DashboardSkeleton />}>
          <DashboardBody filters={filters} />
        </Suspense>
      </main>
    </div>
  );
}
