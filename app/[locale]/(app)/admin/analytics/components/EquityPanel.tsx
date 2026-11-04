import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cardClasses } from '@/components/ui/Card';
import { equityFlags } from '@/lib/analytics/equity';
import type { EquityOverall, EquityRow } from '@/lib/analytics/types';
import { cn } from '@/lib/cn';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { HowMeasured } from './HowMeasured';
import { useFigures } from './figures';

/**
 * "Equity by language". Already a table, so it needs no "View as table"
 * toggle. Rows more than 5 points below average are flagged with an icon and
 * text, never colour alone.
 */
export function EquityPanel({ rows, overall }: { rows: EquityRow[]; overall: EquityOverall }) {
  const t = useTranslations('analytics.equity');
  const f = useFigures();

  return (
    <section
      id="equity"
      aria-labelledby="equity-title"
      className={cn(cardClasses, 'flex flex-col gap-3.5 p-6 motion-safe:animate-fade-up')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="equity-title" className="text-xl font-extrabold tracking-[-0.01em]">
          {t('title')}
        </h2>
        <DemoLabel />
      </div>

      <DataTable
        caption={t('title')}
        minWidth="min-w-140"
        columns={[
          t('columns.language'),
          t('columns.users'),
          t('columns.gain'),
          t('columns.uptake'),
          t('columns.days'),
        ]}
        rows={rows.map((row) => {
          const flags = equityFlags(row, overall);
          return {
            key: row.language,
            cells: [
              <span key="name" className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {t(`languages.${row.language}`)}
                {flags.any ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-bold text-brand-text-dark">
                    <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
                    {t('flag')}
                  </span>
                ) : null}
              </span>,
              f.count(row.users) ?? f.hidden,
              f.points(row.gain) ?? f.hidden,
              f.percent(row.uptakePct) ?? f.hidden,
              f.number(row.medianDays) ?? f.hidden,
            ],
          };
        })}
      />

      <p className="text-[13px] text-muted">{t('footnote')}</p>
      <HowMeasured>{t('how')}</HowMeasured>
    </section>
  );
}
