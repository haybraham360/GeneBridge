import { CircleAlert, RefreshCw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { filtersQuery } from '@/lib/analytics/filters';
import { isEmpty, loadDashboard } from '@/lib/analytics/queries';
import type { DashboardData, Filters } from '@/lib/analytics/types';
import { createClient } from '@/lib/supabase/server';
import { EquityPanel } from './EquityPanel';
import { FunnelPanel } from './FunnelPanel';
import { KpiTiles } from './KpiTiles';
import { ModesPanel } from './ModesPanel';
import { NotTrackedNote } from './NotTrackedNote';

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

  return (
    <>
      <KpiTiles current={data.current} previous={data.previous} range={filters.range} />
      <div className="flex flex-wrap gap-5">
        <FunnelPanel funnel={data.funnel} className="flex-[3_1_460px] motion-safe:animate-fade-up" />
        <ModesPanel modes={data.modes} className="flex-[2_1_300px] motion-safe:animate-fade-up" />
      </div>
      <EquityPanel rows={data.equity} overall={data.overall} />
    </>
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
