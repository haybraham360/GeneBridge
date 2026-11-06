import { useTranslations } from 'next-intl';
import type { DashboardData } from '@/lib/analytics/types';
import { ChartPanel } from './ChartPanel';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { useFigures } from './figures';

/**
 * "Reports scanned" (task 12, rubric 6): how many reports people
 * photographed or uploaded, and the average time to an explanation.
 * Aggregate only; hidden for groups under 10 people.
 */
export function ScansPanel({ data, className }: { data: DashboardData['scans']; className?: string }) {
  const t = useTranslations('analytics.scans');
  const f = useFigures();
  const seconds = data.avgSeconds === null ? f.hidden : t('seconds', { count: Math.round(data.avgSeconds) });
  return (
    <ChartPanel
      className={className}
      title={t('title')}
      subtitle={t('subtitle')}
      how={t('how')}
      label={<DemoLabel />}
      chart={
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-semibold text-muted">{t('scanned')}</dt>
            <dd className="text-[32px] leading-none font-extrabold tracking-[-0.02em]">{f.count(data.scanned) ?? f.hidden}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-semibold text-muted">{t('avg')}</dt>
            <dd className="text-[32px] leading-none font-extrabold tracking-[-0.02em]">{seconds}</dd>
          </div>
        </dl>
      }
      table={
        <DataTable
          caption={t('title')}
          columns={[t('scanned'), t('people'), t('avg')]}
          rows={[{ key: 'scans', cells: [f.count(data.scanned) ?? f.hidden, f.count(data.people) ?? f.hidden, seconds] }]}
        />
      }
    />
  );
}
