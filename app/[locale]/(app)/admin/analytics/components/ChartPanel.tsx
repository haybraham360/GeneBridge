'use client';

import { ChartBar, Table2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { HowMeasured } from './HowMeasured';

type ChartPanelProps = {
  id?: string;
  title: string;
  subtitle?: string;
  /** "How this is measured" text. */
  how: string;
  /** "Synthetic demo data" tag, rendered on the server. */
  label?: ReactNode;
  chart: ReactNode;
  /** Accessible table version of the same figures. */
  table: ReactNode;
  /** Below the chart in both views. */
  footer?: ReactNode;
  className?: string;
};

/**
 * A dashboard card with a visible title, a "How this is measured" note and a
 * "View as table" toggle. The chart and table are both rendered on the
 * server; this only switches between them.
 */
export function ChartPanel({
  id,
  title,
  subtitle,
  how,
  label,
  chart,
  table,
  footer,
  className,
}: ChartPanelProps) {
  const t = useTranslations('analytics.chart');
  const [asTable, setAsTable] = useState(false);
  const headingId = useId();
  const bodyId = useId();

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(cardClasses, 'flex flex-col gap-3.5 p-6', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1.5">
          <h2 id={headingId} className="text-xl font-extrabold tracking-[-0.01em]">
            {title}
          </h2>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {label}
          <button
            type="button"
            aria-pressed={asTable}
            aria-controls={bodyId}
            onClick={() => setAsTable((v) => !v)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-brand-tint-soft"
          >
            {asTable ? (
              <ChartBar aria-hidden="true" className="size-4" strokeWidth={2} />
            ) : (
              <Table2 aria-hidden="true" className="size-4" strokeWidth={2} />
            )}
            {asTable ? t('viewChart') : t('viewTable')}
          </button>
        </div>
      </div>

      <div id={bodyId}>{asTable ? table : chart}</div>

      <HowMeasured>{how}</HowMeasured>

      {footer}
    </section>
  );
}
