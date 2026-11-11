'use client';
/**
 * "Where you are" on the family map: four steps (Describe → Draw → Check →
 * Understand), the current one highlighted, with one plain sentence saying
 * what is happening now and a button that takes the person to the place to
 * look. Announced politely to screen readers as the step changes.
 */
import { ArrowRight, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

export const GUIDE_STEPS = ['describe', 'draw', 'check', 'understand'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

export function FamilyGuide({
  step,
  onDescribe,
  onCheck,
  askHref,
}: {
  step: GuideStep;
  onDescribe: () => void;
  onCheck: () => void;
  askHref: string;
}) {
  const t = useTranslations('family.guide');
  const index = GUIDE_STEPS.indexOf(step);
  const arrow = <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />;
  const action =
    step === 'describe' ? (
      <Button size="sm" variant="dark" onClick={onDescribe}>
        {t('action.describe')}
        {arrow}
      </Button>
    ) : step === 'check' ? (
      <Button size="sm" variant="dark" onClick={onCheck}>
        {t('action.check')}
        {arrow}
      </Button>
    ) : step === 'understand' ? (
      <Button size="sm" href={askHref} data-testid="family-guide-explain">
        {t('action.understand')}
        {arrow}
      </Button>
    ) : null;

  return (
    <section aria-label={t('title')} className={cn(cardClasses, 'mt-5 p-4 sm:p-5')} data-testid="family-guide" data-step={step}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {GUIDE_STEPS.map((s, i) => {
          const done = i < index;
          const current = i === index;
          return (
            <li key={s} className={cn('flex min-w-0 items-center gap-1.5 sm:gap-2', i < GUIDE_STEPS.length - 1 && 'flex-1')} aria-current={current ? 'step' : undefined}>
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold transition-colors duration-300',
                  done && 'bg-ink text-white',
                  current && 'bg-brand text-ink motion-safe:animate-attention',
                  !done && !current && 'border border-line-strong bg-surface text-muted',
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn('truncate text-xs font-bold', current ? 'text-ink' : 'text-muted', !current && 'max-sm:sr-only')}>
                {t(`steps.${s}`)}
                {done ? <span className="sr-only"> ({t('done')})</span> : null}
                {current ? <span className="sr-only"> ({t('current')})</span> : null}
              </span>
              {i < GUIDE_STEPS.length - 1 ? (
                <span aria-hidden className="relative h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className={cn('absolute inset-y-0 start-0 rounded-full bg-ink transition-[width] duration-500 ease-out', done ? 'w-full' : 'w-0')}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center" aria-live="polite">
        <div key={step} className="min-w-0 flex-1 motion-safe:animate-card-in">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t('stepOf', { current: index + 1, total: GUIDE_STEPS.length })}</p>
          <p className="mt-0.5 text-sm leading-relaxed font-semibold" data-testid="family-guide-now">
            {t(`now.${step}`)}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}
