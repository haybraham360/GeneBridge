import { getTranslations } from 'next-intl/server';
import { showSyntheticLabel } from '@/lib/analytics/demo';
import { cn } from '@/lib/cn';

/**
 * "Synthetic demo data" tag on every figure (guardrail 12). Renders nothing
 * unless demo mode is on or synthetic analytics data exists.
 */
export async function DemoLabel({ className }: { className?: string }) {
  if (!(await showSyntheticLabel())) return null;
  const t = await getTranslations('analytics.header');
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full bg-brand-tint-soft px-2.5 py-1 text-xs font-bold text-brand-text-dark',
        className,
      )}
    >
      {t('synthetic')}
    </span>
  );
}
