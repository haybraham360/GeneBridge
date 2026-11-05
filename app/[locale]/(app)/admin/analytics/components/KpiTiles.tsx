import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import type { AnalyticsRange, KpiSet } from '@/lib/analytics/types';
import { cn } from '@/lib/cn';
import { DemoLabel } from './DemoLabel';
import { kpiChange, useFigures, type Change, type KpiKey } from './figures';

type KpiTilesProps = {
  current: KpiSet;
  previous: KpiSet | null;
  range: AnalyticsRange;
};

/** The four headline tiles: value, one-line definition, change vs previous period. */
export function KpiTiles({ current, previous, range }: KpiTilesProps) {
  const t = useTranslations('analytics.kpis');
  const f = useFigures();

  const before = f.percent(current.preScore);
  const after = f.percent(current.postScore);

  const tiles: { key: KpiKey; value: ReactNode | null }[] = [
    {
      key: 'understanding',
      // Laid out as before, arrow, after in a flex row, so it reads in the
      // right order in Arabic too (a single string gets reordered by bidi).
      value:
        before && after ? (
          <>
            <span aria-hidden="true" className="inline-flex items-center gap-2">
              <span>{before}</span>
              <ArrowRight className="size-8 flex-none rtl:-scale-x-100" strokeWidth={2.6} />
              <span>{after}</span>
            </span>
            <span className="sr-only">{t('understanding.valueLabel', { before, after })}</span>
          </>
        ) : null,
    },
    { key: 'uptake', value: f.percent(current.uptakePct) },
    { key: 'referral', value: f.days(current.medianDays) },
    { key: 'onboarding', value: f.percent(current.onboardingPct) },
  ];

  return (
    <section aria-labelledby="kpis-title" className="flex flex-col gap-3">
      <h2 id="kpis-title" className="sr-only">
        {t('heading')}
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {tiles.map((tile) => (
          <Card
            as="li"
            key={tile.key}
            className="flex min-h-60 flex-col gap-2 p-5.5 motion-safe:animate-fade-up"
          >
            <span className="text-sm font-semibold text-muted">{t(`${tile.key}.title`)}</span>
            {tile.value !== null ? (
              <span className="text-[34px] leading-tight font-extrabold tracking-[-0.02em]">
                {tile.value}
              </span>
            ) : (
              <span className="flex min-h-10.5 items-center text-xl font-bold text-muted">
                {f.hidden}
              </span>
            )}
            <span className="text-[13px] leading-snug text-muted">
              {t(`${tile.key}.definition`)}
            </span>
            <ChangeLine
              kpi={tile.key}
              change={kpiChange(tile.key, current, previous)}
              range={range}
            />
            <DemoLabel className="mt-auto" />
          </Card>
        ))}
      </ul>
    </section>
  );
}

/** Arrow plus words, so the direction never depends on colour. */
function ChangeLine({ kpi, change, range }: { kpi: KpiKey; change: Change; range: AnalyticsRange }) {
  const t = useTranslations('analytics.kpis.change');
  const f = useFigures();
  const rangeText = range === '30' ? t('range30') : t('range90');

  let text: string;
  let Icon = Minus;
  switch (change.kind) {
    case 'allTime':
      text = t('allTime');
      break;
    case 'unavailable':
      text = t('unavailable', { range: rangeText });
      break;
    case 'same':
      text = t('same', { range: rangeText });
      break;
    default: {
      const up = change.kind === 'up';
      Icon = up ? ArrowUp : ArrowDown;
      if (kpi === 'referral') {
        text = t(up ? 'longer' : 'shorter', { value: change.amount, range: rangeText });
      } else {
        const value = f.number(change.amount) ?? '';
        const key =
          kpi === 'understanding' ? (up ? 'upGain' : 'downGain') : up ? 'upPoints' : 'downPoints';
        text = t(key, { value, count: change.amount, range: rangeText });
      }
    }
  }

  return (
    <span className={cn('flex items-start gap-1.5 text-[13px] leading-snug font-semibold text-ink-soft')}>
      <Icon aria-hidden="true" className="mt-px size-4 flex-none" strokeWidth={2.2} />
      {text}
    </span>
  );
}
