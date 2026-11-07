'use client';

import { BadgeCheck, Check, FileCheck2, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { DetailsFields, type DetailsValue } from '@/components/pro/DetailsFields';
import { Button, buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { OptionCards } from '@/components/ui/OptionCards';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import type { DetailsField } from '@/lib/kyc/details';
import { REVIEW_DAYS } from '@/lib/kyc/types';
import { proCompleteStep, proGoBack, type ProStep, type ProStepResult } from '../proActions';

const TOTAL = 4;
const HEADING_ID = 'pro-onboarding-title';
const keys = ['welcome', 'about', 'preferences', 'done'] as const;

export type ProOnboardingInitial = {
  step: ProStep;
  details: DetailsValue;
  language: 'ar' | 'en';
  notifyEmail: boolean;
};

/**
 * Professional onboarding (task 14, section 2): welcome, about you,
 * language and notifications, done. Same card style as patient onboarding.
 * Every step is saved before moving on, so leaving resumes on the same step.
 */
export function ProOnboardingFlow({ initial }: { initial: ProOnboardingInitial }) {
  const t = useTranslations('proOnboarding');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<ProStep>(initial.step);
  const [details, setDetails] = useState<DetailsValue>(initial.details);
  const [errors, setErrors] = useState<DetailsField[]>([]);
  const [language, setLanguage] = useState<'ar' | 'en'>(initial.language);
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyEmail);
  const [saveError, setSaveError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const key = keys[step - 1];

  const apply = (result: ProStepResult) => {
    if (result.status === 'invalid') {
      setErrors(result.errors);
      requestAnimationFrame(() => document.getElementById(result.errors[0])?.focus());
      return;
    }
    if (result.status === 'error') return setSaveError(true);
    setSaveError(false);
    setErrors([]);
    if (result.status === 'ok' && result.uiLocale && result.uiLocale !== document.documentElement.lang) {
      // The done screen in the language they chose.
      router.replace('/onboarding?done=1', { locale: result.uiLocale });
      return;
    }
    setStep(result.step);
  };

  const next = () =>
    startTransition(async () => {
      const result = await proCompleteStep({
        step,
        details: step === 2 ? details : undefined,
        language: step === 3 ? language : undefined,
        notifyEmail: step === 3 ? notifyEmail : undefined,
      }).catch((): ProStepResult => ({ status: 'error' }));
      apply(result);
    });

  const back = () =>
    startTransition(async () => {
      apply(await proGoBack({ step }).catch((): ProStepResult => ({ status: 'error' })));
    });

  const stepLabel = t('stepOf', { step, total: TOTAL });

  return (
    <div className="flex min-h-screen flex-col gap-6 px-[clamp(16px,4vw,48px)] pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo size="sm" />
        <span role="status" aria-live="polite" className="text-sm font-semibold text-muted">
          {stepLabel}
        </span>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <div
          role="progressbar"
          aria-label={t('progressLabel')}
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={step}
          aria-valuetext={stepLabel}
          className="h-2 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${(step / TOTAL) * 100}%` }} />
        </div>

        <section aria-labelledby={HEADING_ID} aria-busy={pending || undefined} className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,40px)]')}>
          <div key={step} className="step-forward flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h1
                id={HEADING_ID}
                ref={headingRef}
                tabIndex={-1}
                className="text-[clamp(26px,4vw,30px)] leading-tight font-extrabold tracking-[-0.02em] focus:outline-none"
              >
                {t(`steps.${key}.title`)}
              </h1>
              <p className="text-base leading-[1.55] text-muted">{t(`steps.${key}.body`, { days: REVIEW_DAYS })}</p>
            </div>

            {key === 'welcome' ? (
              <ul className="flex flex-col gap-3">
                {(
                  [
                    ['details', Check],
                    ['documents', FileCheck2],
                    ['review', ShieldCheck],
                    ['verified', BadgeCheck],
                  ] as const
                ).map(([item, Icon]) => (
                  <li key={item} className="flex items-start gap-3 rounded-tile bg-bg p-4">
                    <Icon aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
                    <span className="text-[15px]">{t(`steps.welcome.items.${item}`)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {key === 'about' ? <DetailsFields value={details} onChange={setDetails} errors={errors} /> : null}

            {key === 'preferences' ? (
              <div className="flex flex-col gap-5">
                <p id="pro-language" className="text-[15px] font-bold">
                  {t('steps.preferences.language')}
                </p>
                <OptionCards
                  options={[
                    { value: 'ar', label: 'العربية', sub: t('steps.preferences.arabic'), lang: 'ar' },
                    { value: 'en', label: 'English', sub: t('steps.preferences.english'), lang: 'en' },
                  ]}
                  value={language}
                  onChange={setLanguage}
                  onSubmit={next}
                  labelledBy="pro-language"
                  disabled={pending}
                />
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-[15px] font-bold">{t('steps.preferences.notifications')}</legend>
                  <p className="text-sm text-muted">{t('steps.preferences.inApp')}</p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-tile border border-line bg-surface p-4 text-[15px]">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                      className="mt-0.5 size-5 shrink-0 cursor-pointer accent-ink"
                    />
                    <span>{t('steps.preferences.email')}</span>
                  </label>
                </fieldset>
              </div>
            ) : null}

            {key === 'done' ? (
              <div className="flex items-start gap-3 rounded-tile bg-brand-tint-soft p-4">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" />
                <p className="text-[15px]">{t('steps.done.note')}</p>
              </div>
            ) : null}
          </div>

          {saveError ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {t('saveError')}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap justify-between gap-3">
            {step === 2 || step === 3 ? (
              <Button variant="ghost" onClick={back} disabled={pending}>
                {t('back')}
              </Button>
            ) : null}
            <span className="flex-1" />
            {key === 'done' ? (
              <Button href="/pro" className="min-w-[200px]">
                {t('steps.done.cta')}
              </Button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={pending}
                aria-busy={pending || undefined}
                className={buttonClasses('primary', 'md', 'min-w-40 disabled:cursor-wait disabled:opacity-60')}
              >
                {key === 'welcome' ? t('start') : t('next')}
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
