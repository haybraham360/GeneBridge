import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Expandable "How this is measured" note under each chart. */
export function HowMeasured({ children }: { children: string }) {
  const t = useTranslations('analytics.chart');
  return (
    <details className="group text-[13px] leading-normal text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold text-ink-soft hover:text-ink">
        {t('howMeasured')}
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180"
          strokeWidth={2}
        />
      </summary>
      <p className="max-w-[65ch] pb-1">{children}</p>
    </details>
  );
}
