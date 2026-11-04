import { useTranslations } from 'next-intl';
import { isDemoData } from '@/lib/analytics/demo';
import { cn } from '@/lib/cn';

/**
 * "Synthetic demo data" tag on every figure (guardrail 12). Renders nothing
 * unless NEXT_PUBLIC_DEMO_DATA=true.
 */
export function DemoLabel({ className }: { className?: string }) {
  const t = useTranslations('analytics.header');
  if (!isDemoData()) return null;
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
