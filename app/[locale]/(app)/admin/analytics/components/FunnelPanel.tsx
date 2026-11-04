import { useTranslations } from 'next-intl';
import type { FunnelStep } from '@/lib/analytics/types';
import { BarList } from './BarList';
import { ChartPanel } from './ChartPanel';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { useFigures } from './figures';

/** People steps are drawn in ink, couple steps in orange, as in the design. */
const coupleSteps = new Set(['at_risk_couples', 'booked_counselling', 'attended_counselling']);

/** "From sign-up to counselling". Bars are sized against the first step. */
export function FunnelPanel({ funnel, className }: { funnel: FunnelStep[]; className?: string }) {
  const t = useTranslations('analytics.funnel');
  const f = useFigures();
  const base = funnel[0]?.value ?? null;

  const rows = funnel.map((step, i) => {
    const previous = i > 0 ? funnel[i - 1].value : null;
    const ofPrevious =
      step.value !== null && previous !== null && previous > 0
        ? f.percent((100 * step.value) / previous)
        : null;
    return {
      step,
      label: t(`steps.${step.step}`),
      count: f.count(step.value),
      ofPrevious,
    };
  });

  return (
    <ChartPanel
      id="engagement"
      className={className}
      title={t('title')}
      how={t('how')}
      label={<DemoLabel />}
      chart={
        <BarList
          bars={rows.map(({ step, label, count, ofPrevious }) => ({
            key: step.step,
            label,
            width:
              step.value === null || base === null || base === 0
                ? null
                : (100 * step.value) / base,
            value: count ?? f.hidden,
            detail: ofPrevious ? t('ofPrevious', { value: ofPrevious }) : null,
            tone: coupleSteps.has(step.step) ? 'brand' : 'ink',
          }))}
        />
      }
      table={
        <DataTable
          caption={t('title')}
          columns={[t('columns.step'), t('columns.count'), t('columns.ofPrevious')]}
          rows={rows.map(({ step, label, count, ofPrevious }, i) => ({
            key: step.step,
            cells: [label, count ?? f.hidden, i === 0 ? '' : (ofPrevious ?? f.hidden)],
          }))}
        />
      }
    />
  );
}
