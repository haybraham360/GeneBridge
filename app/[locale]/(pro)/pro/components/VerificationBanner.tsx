'use client';

import { BadgeCheck, Check, Clock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { progressStep, REVIEW_DAYS, type BannerState } from '@/lib/kyc/types';
import { dismissWelcome } from '../kycActions';

const stages = ['details', 'documents', 'review', 'verified'] as const;

/**
 * The verification banner at the top of the workspace (task 14, section 4).
 * Hidden inside the verification flow itself. Once verified it disappears,
 * after a one-time welcome card.
 */
export function VerificationBanner({ state, welcomeSeen }: { state: BannerState; welcomeSeen: boolean }) {
  const t = useTranslations('verify.banner');
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(welcomeSeen);
  const [pending, startTransition] = useTransition();

  if (pathname.startsWith('/pro/verify')) return null;

  if (state.kind === 'verified') {
    if (dismissed) return null;
    return (
      <section data-testid="welcome-card" aria-labelledby="welcome-title" className="flex items-start gap-4 rounded-card border border-success-tint bg-success-tint p-5">
        <BadgeCheck aria-hidden="true" className="mt-0.5 size-6 flex-none text-success-text" strokeWidth={2} />
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="welcome-title" className="text-lg font-extrabold">
            {t('welcome.title')}
          </h2>
          <p className="text-[15px]">{t('welcome.body')}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setDismissed(true);
              await dismissWelcome().catch(() => undefined);
            })
          }
          aria-label={t('welcome.dismiss')}
          className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full hover:bg-white/60"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </section>
    );
  }

  const tone = state.kind === 'rejected' || state.kind === 'suspended' || state.kind === 'expired' ? 'alert' : 'info';
  const Icon = state.kind === 'pending' ? Clock : tone === 'alert' ? ShieldAlert : ShieldCheck;
  const message = state.kind === 'needs_more_info' || state.kind === 'rejected' ? state.message : null;
  const step = progressStep(state);

  return (
    <section
      data-testid="verify-banner"
      data-state={state.kind}
      aria-labelledby="verify-banner-title"
      className={cn('flex flex-col gap-4 rounded-card border p-5', tone === 'alert' ? 'border-affected/30 bg-affected-tint' : 'border-line bg-brand-tint-soft')}
    >
      <div className="flex flex-wrap items-start gap-4">
        <Icon aria-hidden="true" className={cn('mt-0.5 size-6 flex-none', tone === 'alert' ? 'text-affected' : 'text-brand-text')} strokeWidth={2} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="verify-banner-title" className="text-lg font-extrabold">
            {t(`${state.kind}.title`, { days: REVIEW_DAYS })}
          </h2>
          <p className="text-[15px] text-ink-soft">{t(`${state.kind}.body`, { days: REVIEW_DAYS })}</p>
          {message ? (
            <blockquote className="mt-2 rounded-tile border border-line bg-surface p-3 text-[15px]">
              <span className="block text-xs font-bold tracking-[0.08em] text-muted uppercase">{t('reviewerMessage')}</span>
              {message}
            </blockquote>
          ) : null}
        </div>
        {state.kind === 'pending' ? (
          <Link href="/pro/verify/submission" className={buttonClasses('ghost', 'sm')}>
            {t('viewSubmission')}
          </Link>
        ) : state.kind === 'suspended' ? null : (
          <Link href="/pro/verify" className={buttonClasses('primary', 'sm')}>
            {state.kind === 'needs_more_info' || state.kind === 'rejected' ? t('resubmit') : t('verifyNow')}
          </Link>
        )}
      </div>

      {state.kind !== 'suspended' ? (
        <ol aria-label={t('progressLabel')} className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-semibold">
          {stages.map((stage, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={stage} className="flex items-center gap-2">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3',
                    done ? 'bg-ink text-white' : current ? 'border border-ink bg-surface' : 'border border-line bg-surface text-muted',
                  )}
                >
                  {done ? <Check aria-hidden="true" className="size-4" strokeWidth={2.5} /> : null}
                  {t(`stages.${stage}`)}
                  {done ? <span className="sr-only">{t('stageDone')}</span> : null}
                </span>
                {i < stages.length - 1 ? (
                  <span aria-hidden="true" className="text-muted rtl:-scale-x-100">
                    →
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
