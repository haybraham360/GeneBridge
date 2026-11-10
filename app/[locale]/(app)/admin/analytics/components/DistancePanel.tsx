import { useTranslations } from 'next-intl';
import type { DistanceRow } from '@/lib/analytics/types';
import { BarList } from './BarList';
import { ChartPanel } from './ChartPanel';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { useFigures } from './figures';

/**
 * "Distance to care" (docs/nearby-care.md, rubric 6): how far the nearest
 * verified professional was for "Care near you" searches. Aggregate only;
 * each band is hidden when fewer than 10 people are in it. No location or
 * area is ever logged.
 */
export function DistancePanel({ rows, className }: { rows: DistanceRow[]; className?: string }) {
  const t = useTranslations('analytics.distance');
  const f = useFigures();
  const shown = rows.filter((r) => r.searches !== null);
  const total = shown.reduce((sum, r) => sum + (r.searches ?? 0), 0);
  const share = (r: DistanceRow) => (r.searches === null || total === 0 ? null : (100 * r.searches) / total);

  return (
    <ChartPanel
      className={className}
      title={t('title')}
      subtitle={t('subtitle')}
      how={t('how')}
      label={<DemoLabel />}
      chart={
        <BarList
          bars={rows.map((r) => ({
            key: r.band,
            label: t(`bands.${r.band}`),
            width: share(r),
            value: f.count(r.searches) ?? f.hidden,
            detail: f.percent(share(r)),
            tone: r.band === 'none' || r.band === '25plus' ? 'brand' : 'ink',
          }))}
        />
      }
      table={
        <DataTable
          caption={t('title')}
          columns={[t('band'), t('searches'), t('people'), t('share')]}
          rows={rows.map((r) => ({
            key: r.band,
            cells: [t(`bands.${r.band}`), f.count(r.searches) ?? f.hidden, f.count(r.people) ?? f.hidden, f.percent(share(r)) ?? f.hidden],
          }))}
        />
      }
    />
  );
}
