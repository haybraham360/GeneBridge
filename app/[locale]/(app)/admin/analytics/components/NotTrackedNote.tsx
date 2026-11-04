import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/** Fixed note (rubric 6): shown whatever the filters, data or errors. */
export function NotTrackedNote({ className }: { className?: string }) {
  const t = useTranslations('analytics');
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-input bg-ink p-3.5 text-sm leading-normal text-white',
        className,
      )}
    >
      <Info aria-hidden="true" className="size-5 flex-none text-brand-hover" strokeWidth={2} />
      <span>{t('notTracked')}</span>
    </p>
  );
}
