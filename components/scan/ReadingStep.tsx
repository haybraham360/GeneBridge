'use client';

import { Check, Circle, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { scanSteps, type ScanStep } from '@/lib/scan/types';

type Props = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** The latest step the server reported. */
  step: ScanStep;
  onCancel: () => void;
};

const PACE_MS = 700;

/**
 * "Reading your report" (task 12): four live steps from the server. Steps
 * move on gently, one at a time, never faster than the server. With reduced
 * motion there's no spinner, only ticks. No suspense or celebration.
 */
export function ReadingStep({ headingRef, step, onCancel }: Props) {
  const t = useTranslations('scan');
  const target = scanSteps.indexOf(step);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= target) return;
    const timer = setTimeout(() => setShown((s) => Math.min(s + 1, target)), PACE_MS);
    return () => clearTimeout(timer);
  }, [shown, target]);

  return (
    <section aria-labelledby="reading-title" className={cn(cardClasses, 'flex max-w-xl flex-col gap-6 p-[clamp(24px,4vw,36px)]')}>
      <h1 id="reading-title" ref={headingRef} tabIndex={-1} className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] outline-none">
        {t('reading.title')}
      </h1>
      <ol className="flex flex-col gap-4" data-testid="reading-steps">
        {scanSteps.map((s, i) => {
          const state = i < shown ? 'done' : i === shown ? 'current' : 'waiting';
          return (
            <li key={s} className="flex items-center gap-3" aria-current={state === 'current' ? 'step' : undefined}>
              <span
                className={cn(
                  'flex size-8 flex-none items-center justify-center rounded-full',
                  state === 'done' ? 'bg-success-tint text-success-text' : state === 'current' ? 'bg-brand-tint text-brand-text-dark' : 'bg-bg text-muted',
                )}
              >
                {state === 'done' ? (
                  <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
                ) : state === 'current' ? (
                  <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" strokeWidth={2.5} />
                ) : (
                  <Circle aria-hidden="true" className="size-3" strokeWidth={2.5} />
                )}
              </span>
              <span className={cn('text-base', state === 'waiting' ? 'text-muted' : 'font-bold')}>
                {t(`reading.steps.${s}`)}
                <span className="sr-only">: {t(`reading.${state}`)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {/* Announced politely as each step starts. */}
      <p role="status" aria-live="polite" className="sr-only">
        {t(`reading.steps.${scanSteps[shown]}`)}
      </p>
      <p className="flex items-start gap-2 text-sm leading-normal text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 flex-none text-success-text" strokeWidth={2} />
        {t('privacy')}
      </p>
      <button type="button" onClick={onCancel} className={buttonClasses('ghost', 'md', 'self-start')}>
        {t('reading.cancel')}
      </button>
    </section>
  );
}
