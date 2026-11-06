import { useTranslations } from 'next-intl';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

function Block({ className }: { className?: string }) {
  return <span className={cn('block rounded-md bg-line/70 motion-safe:animate-pulse', className)} />;
}

/**
 * Shown the moment someone opens a page while its data loads, so the menu
 * stays put and the click feels instant. Neutral shapes only: no copy, no
 * figures. The pulse stops for reduced motion.
 */
export function PageSkeleton({ padded = true }: { padded?: boolean }) {
  const t = useTranslations('common');
  return (
    <div className={cn('min-w-0 flex-1', padded && 'px-[clamp(16px,3vw,40px)] pt-9 pb-10')} aria-busy="true">
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Block className="h-8 w-64 max-w-[70vw]" />
            <Block className="h-4 w-80 max-w-[80vw]" />
          </div>
          <Block className="h-12 w-32 rounded-full" />
        </div>
        <div className={cn(cardClasses, 'flex flex-col gap-3 p-6')}>
          <Block className="h-6 w-48" />
          <Block className="h-4 w-full" />
          <Block className="h-4 w-5/6" />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className={cn(cardClasses, 'flex min-h-44 flex-col gap-3 p-6')}>
              <Block className="h-5 w-40" />
              <Block className="h-4 w-full" />
              <Block className="h-4 w-3/4" />
              <Block className="mt-auto h-11 w-36 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
