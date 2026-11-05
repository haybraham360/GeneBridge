import { useTranslations } from 'next-intl';
import type { DashboardData } from '@/lib/analytics/types';
import { BarList } from './BarList';
import { ChartPanel } from './ChartPanel';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { useFigures } from './figures';

/**
 * "Exploring to tested" (task 11, rubric 6): of the people who started on
 * the exploring path, the share who later added a result. Aggregate only;
 * every figure is hidden for groups under 10.
 */
export function ExploringPanel({ data, className }: { data: DashboardData['exploring']; className?: string }) {
  const t = useTranslations('analytics.exploring');
  const f = useFigures();
  return (
    <ChartPanel
      className={className}
      title={t('title')}
      subtitle={t('subtitle')}
      how={t('how')}
      label={<DemoLabel />}
      chart={
        <BarList
          bars={[
            {
              key: 'tested',
              label: t('pct'),
              width: data.testedPct === null ? null : Math.max(0, Math.min(100, data.testedPct)),
              value: f.percent(data.testedPct) ?? f.hidden,
              tone: 'brand',
            },
          ]}
        />
      }
      table={
        <DataTable
          caption={t('title')}
          columns={[t('explorers'), t('tested'), t('pct')]}
          rows={[
            {
              key: 'exploring',
              cells: [f.count(data.explorers) ?? f.hidden, f.count(data.tested) ?? f.hidden, f.percent(data.testedPct) ?? f.hidden],
            },
          ]}
        />
      }
    />
  );
}
