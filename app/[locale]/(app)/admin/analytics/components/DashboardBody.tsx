import { CircleAlert, Hourglass, RefreshCw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card, cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { filtersQuery } from '@/lib/analytics/filters';
import { isEmpty, loadDashboard } from '@/lib/analytics/queries';
import type { DashboardData, Filters } from '@/lib/analytics/types';
import { createClient } from '@/lib/supabase/server';
import { EquityPanel } from './EquityPanel';
import { ExploringPanel } from './ExploringPanel';
import { ScansPanel } from './ScansPanel';
import { DistancePanel } from './DistancePanel';
import { FunnelPanel } from './FunnelPanel';
import { KpiTiles } from './KpiTiles';
import { ModesPanel } from './ModesPanel';
import { NotTrackedNote } from './NotTrackedNote';
import { TrendPanel } from './TrendPanel';

/** Loads the figures for the current filters and renders every panel. */
export async function DashboardBody({ filters }: { filters: Filters }) {
  const t = await getTranslations('analytics');

  let data: DashboardData;
  try {
    data = await loadDashboard(await createClient(), filters);
  } catch {
    return (
      <StateCard icon="error" title={t('error.title')} body={t('error.body')}>
        <Link
          href={`/admin/analytics${filtersQuery(filters)}`}
          className={buttonClasses('ghost', 'md', 'w-fit')}
        >
          <RefreshCw aria-hidden="true" className="size-4.5" strokeWidth={2} />
          {t('error.retry')}
        </Link>
      </StateCard>
    );
  }

  if (isEmpty(data)) {
    return <StateCard icon="empty" title={t('empty.title')} body={t('empty.body')} />;
  }

  // Panels with no figure to show fold into one short "waiting" card instead
  // of a full-size card of "Hidden (under 10)" rows.
  const shows = {
    trend: data.trend.some((w) => w.preScore !== null || w.signups !== null),
    exploring: data.exploring.explorers !== null,
    scans: data.scans.scanned !== null,
    distance: data.distance.some((r) => r.searches !== null),
  };
  const waiting = (Object.keys(shows) as (keyof typeof shows)[]).filter((k) => !shows[k]);
  const animate = 'motion-safe:animate-fade-up';

  return (
    <>
      <KpiTiles current={data.current} previous={data.previous} range={filters.range} />
      {shows.trend ? <TrendPanel weeks={data.trend} className={animate} /> : null}
      <div className="flex flex-wrap gap-5">
        <FunnelPanel funnel={data.funnel} className={`min-w-0 flex-[3_1_460px] ${animate}`} />
        <ModesPanel modes={data.modes} className={`min-w-0 flex-[2_1_300px] ${animate}`} />
      </div>
      <EquityPanel rows={data.equity} overall={data.overall} />
      {shows.exploring || shows.scans ? (
        <div className="flex flex-wrap gap-5">
          {shows.exploring ? (
            <ExploringPanel data={data.exploring} className={`min-w-0 flex-[1_1_380px] ${animate}`} />
          ) : null}
          {shows.scans ? <ScansPanel data={data.scans} className={`min-w-0 flex-[1_1_380px] ${animate}`} /> : null}
        </div>
      ) : null}
      {shows.distance ? <DistancePanel rows={data.distance} className={animate} /> : null}
      {waiting.length ? <WaitingCard panels={waiting.map((k) => t(`${k}.title`))} /> : null}
    </>
  );
}

/** One compact card naming the panels that have no group of 10 yet. */
async function WaitingCard({ panels }: { panels: string[] }) {
  const t = await getTranslations('analytics.notEnough');
  return (
    <section aria-labelledby="waiting-title" className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
      <div className="flex items-start gap-3">
        <Hourglass aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
        <div className="flex flex-col gap-1">
          <h2 id="waiting-title" className="text-lg font-extrabold tracking-[-0.01em]">
            {t('title')}
          </h2>
          <p className="max-w-[65ch] text-sm text-muted">{t('body')}</p>
        </div>
      </div>
      <p className="sr-only">{t('list')}</p>
      <ul className="flex flex-wrap gap-2">
        {panels.map((name) => (
          <li key={name} className="rounded-full border border-line-strong px-3 py-1 text-[13px] font-semibold text-ink-soft">
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: 'error' | 'empty';
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-6" as="section">
      <div className="flex items-start gap-3" role={icon === 'error' ? 'alert' : 'status'}>
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-6 flex-none text-brand-text"
          strokeWidth={2}
        />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-extrabold tracking-[-0.01em]">{title}</h2>
          <p className="max-w-[60ch] text-[15px] text-muted">{body}</p>
        </div>
      </div>
      {children}
      <NotTrackedNote className="max-w-xl" />
    </Card>
  );
}
