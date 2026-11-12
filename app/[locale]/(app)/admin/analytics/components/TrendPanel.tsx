import { useFormatter, useTranslations } from 'next-intl';
import { trendSummary } from '@/lib/analytics/trend';
import type { TrendWeek } from '@/lib/analytics/types';
import { ChartPanel } from './ChartPanel';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { useFigures } from './figures';
import { TrendChart, type TrendLabels } from './TrendChart';

/**
 * "Understanding over time" (rubric 6): the teach-back score before and
 * after the result explainer, week by week, with sign-ups underneath. Shows
 * that the gain holds across weeks rather than resting on one average.
 */
export function TrendPanel({ weeks, className }: { weeks: TrendWeek[]; className?: string }) {
  const t = useTranslations('analytics.trend');
  const tAll = useTranslations('analytics');
  const f = useFigures();
  const format = useFormatter();
  const summary = trendSummary(weeks);

  // Week starts are dates without a time zone: format them as UTC so the day never shifts.
  const date = (iso: string, long = false) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: 'numeric',
      month: 'short',
      ...(long ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  const gain = (w: TrendWeek) =>
    w.preScore === null || w.postScore === null ? null : w.postScore - w.preScore;

  const labels: TrendLabels = {
    axis: weeks.map((w) => date(w.weekStart)),
    heading: weeks.map((w) => t('weekOf', { date: date(w.weekStart, true) })),
    before: weeks.map((w) => f.percent(w.preScore)),
    after: weeks.map((w) => f.percent(w.postScore)),
    gain: weeks.map((w) => f.points(gain(w))),
    signups: weeks.map((w) => f.count(w.signups)),
  };

  return (
    <ChartPanel
      id="trend"
      className={className}
      title={t('title')}
      subtitle={t('subtitle')}
      how={t('how')}
      label={<DemoLabel />}
      chart={
        <div className="flex flex-col gap-5">
          {summary.avgGain !== null ? (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[34px] leading-none font-extrabold tracking-[-0.02em]">
                {f.points(summary.avgGain)}
              </span>
              <span className="text-sm text-muted">
                {t('summary', { weeks: summary.shownWeeks })}
                {summary.shownWeeks > 1 ? (
                  <>
                    {' · '}
                    {t('range', { min: f.points(summary.minGain)!, max: f.points(summary.maxGain)! })}
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          <TrendChart weeks={weeks} labels={labels} />
        </div>
      }
      table={
        <DataTable
          caption={t('title')}
          columns={[
            t('columns.week'),
            t('columns.signups'),
            t('columns.before'),
            t('columns.after'),
            t('columns.gain'),
          ]}
          rows={weeks.map((w, i) => ({
            key: w.weekStart,
            cells: [
              date(w.weekStart, true),
              labels.signups[i] ?? tAll('hidden'),
              labels.before[i] ?? tAll('hidden'),
              labels.after[i] ?? tAll('hidden'),
              labels.gain[i] ?? tAll('hidden'),
            ],
          }))}
        />
      }
    />
  );
}
