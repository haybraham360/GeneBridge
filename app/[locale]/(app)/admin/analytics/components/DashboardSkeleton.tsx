import { useTranslations } from 'next-intl';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

function Block({ className }: { className?: string }) {
  return <span className={cn('block rounded-md bg-line/70 motion-safe:animate-pulse', className)} />;
}

function BarRows({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-[minmax(110px,180px)_minmax(80px,1fr)_auto] items-center gap-x-3 gap-y-3.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="contents">
          <Block className="h-4 w-28" />
          <Block className="h-5.5" />
          <span className="flex min-h-9 min-w-16 items-center justify-end">
            <Block className="h-4 w-12" />
          </span>
        </div>
      ))}
    </div>
  );
}

function PanelShell({ rows, className, footer }: { rows: number; className?: string; footer?: boolean }) {
  return (
    <div className={cn(cardClasses, 'flex flex-col gap-3.5 p-6', className)}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Block className="h-6 w-56" />
        <Block className="h-11 w-36 rounded-full" />
      </div>
      <BarRows count={rows} />
      <Block className="my-3.5 h-4 w-40" />
      {footer ? <Block className="mt-auto h-17 rounded-input" /> : null}
    </div>
  );
}

/**
 * Placeholder with the same shapes and sizes as the loaded dashboard, so
 * nothing jumps when the figures arrive. The pulse stops for reduced motion.
 */
export function DashboardSkeleton() {
  const t = useTranslations('analytics');
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="contents">
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className={cn(cardClasses, 'flex min-h-60 flex-col gap-3 p-5.5')}>
              <Block className="h-4 w-36" />
              <Block className="h-10 w-32" />
              <Block className="h-4 w-44" />
              <Block className="h-4 w-40" />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-5">
          <PanelShell rows={6} className="flex-[3_1_460px]" />
          <PanelShell rows={3} className="flex-[2_1_300px]" footer />
        </div>
        <div className={cn(cardClasses, 'flex flex-col gap-3.5 p-6')}>
          <div className="flex items-center justify-between">
            <Block className="h-6 w-52" />
            <Block className="h-6 w-36 rounded-full" />
          </div>
          <div className="flex flex-col">
            <Block className="mb-3 h-5" />
            {Array.from({ length: 5 }, (_, i) => (
              <Block key={i} className="my-3.5 h-5" />
            ))}
          </div>
          <Block className="h-4 w-80" />
          <Block className="my-3.5 h-4 w-40" />
        </div>
      </div>
    </div>
  );
}
