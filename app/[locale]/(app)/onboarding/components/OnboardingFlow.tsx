'use client';

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { ListenButton } from '@/components/ui/ListenButton';
import { Logo } from '@/components/ui/Logo';
import { useRouter } from '@/i18n/navigation';
import { speak, stopSpeaking } from '@/lib/audio/speak';
import { cn } from '@/lib/cn';
import type { Finish } from '@/lib/onboarding/queries';
import {
  autoListens,
  canSkip,
  DONE_STEP,
  isFullyTranslated,
  languageChoices,
  learningModes,
  PRIVACY_STEP,
  progressPercent,
  reasons,
  stepKey,
  TOTAL_STEPS,
  type LanguageChoice,
  type LearningMode,
  type Reason,
  type StepNumber,
} from '@/lib/onboarding/steps';
import { claimResult, completeStep, goBack, setLanguage, type StepResult } from '../actions';
import { ConnectResultStep, type ClaimError } from './ConnectResultStep';
import { InviteStep } from './InviteStep';
import { OptionCards } from './OptionCards';
import { PrivacyStep } from './PrivacyStep';

export type OnboardingInitial = {
  step: StepNumber;
  language: LanguageChoice;
  learningMode: LearningMode | null;
  reason: Reason | null;
  privacyAgreed: boolean;
  resultConnected: boolean;
  finish: Finish | null;
};

/** Set before a language switch reloads the page, so focus returns to the choice. */
const FOCUS_LANGUAGE_KEY = 'gb-onboarding-focus-language';
const HEADING_ID = 'onboarding-title';

const finishKeys = {
  '/dashboard/results': 'results',
  '/dashboard/counsellor': 'counsellor',
  '/home': 'home',
} as const satisfies Record<Finish['destination'], string>;

/**
 * The 8-step onboarding (design/source/Onboarding.dc.html). One question per
 * screen. Every answer is saved by a server action before moving on, so
 * leaving at any point resumes on the same step.
 */
export function OnboardingFlow({ initial }: { initial: OnboardingInitial }) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<StepNumber>(initial.step);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [language, setLanguageChoice] = useState<LanguageChoice>(initial.language);
  const [learningMode, setLearningMode] = useState<LearningMode | null>(initial.learningMode);
  const [reason, setReason] = useState<Reason | null>(initial.reason);
  const [agreed, setAgreed] = useState(initial.privacyAgreed);
  const [showAgreeRequired, setShowAgreeRequired] = useState(false);
  const [code, setCode] = useState('');
  const [claimError, setClaimError] = useState<ClaimError | null>(null);
  const [resultConnected, setResultConnected] = useState(initial.resultConnected);
  const [invited, setInvited] = useState(false);
  const [finish, setFinish] = useState<Finish | null>(initial.finish);
  const [saveError, setSaveError] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const learningModeRef = useRef(learningMode);
  const speechId = useRef(0);
  const stopSpeech = useRef<(() => void) | null>(null);

  useEffect(() => {
    learningModeRef.current = learningMode;
  }, [learningMode]);

  const key = stepKey(step);
  const title = t(`steps.${key}.title`);
  const finishKey = finishKeys[finish?.destination ?? '/home'];
  const body = key === 'done' ? t(`steps.done.body.${finishKey}`) : t(`steps.${key}.body`);

  // ---------------------------------------------------------------- listen
  const stopReading = useCallback(() => {
    speechId.current += 1;
    stopSpeech.current?.();
    stopSpeech.current = null;
    setSpeaking(false);
  }, []);

  const read = useCallback(
    (text: string) => {
      stopSpeech.current?.();
      const id = ++speechId.current;
      setSpeaking(true);
      stopSpeech.current = speak(text, locale === 'ar' ? 'ar' : 'en', {
        onEnd: () => {
          if (speechId.current === id) setSpeaking(false);
        },
      });
    },
    [locale],
  );

  const stepText = `${title}. ${body}`;
  const stepTextRef = useRef(stepText);
  useEffect(() => {
    stepTextRef.current = stepText;
  }, [stepText]);

  // New step: move focus to its heading (screen readers hear it, and the
  // live region announces "Step X of 8"), and read it aloud in listen mode.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (sessionStorage.getItem(FOCUS_LANGUAGE_KEY)) {
        sessionStorage.removeItem(FOCUS_LANGUAGE_KEY);
        document.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
      }
    } else {
      headingRef.current?.focus();
    }
    if (autoListens(learningModeRef.current)) read(stepTextRef.current);
    else stopReading();
  }, [step, read, stopReading]);

  useEffect(() => () => stopSpeaking(), []);

  // ---------------------------------------------------------------- saving
  const apply = useCallback(
    (result: StepResult, to: 'forward' | 'back') => {
      if (result.status === 'error') {
        setSaveError(true);
        return;
      }
      setSaveError(false);
      if (result.status === 'ok' && result.finish) setFinish(result.finish);
      // Finished in another tab: let the page send them on.
      if (result.status === 'moved' && result.step === DONE_STEP) {
        router.refresh();
        return;
      }
      setDirection(to);
      setStep(result.step);
    },
    [router],
  );

  const complete = useCallback(
    (skipped: boolean) => {
      startTransition(async () => {
        const result = await completeStep({
          step,
          skipped,
          learningMode: learningMode ?? undefined,
          reason: reason ?? undefined,
          agreed: step === PRIVACY_STEP ? agreed : undefined,
        }).catch((): StepResult => ({ status: 'error' }));
        apply(result, 'forward');
      });
    },
    [agreed, apply, learningMode, reason, step],
  );

  const back = () => {
    startTransition(async () => {
      const result = await goBack({ step }).catch((): StepResult => ({ status: 'error' }));
      apply(result, 'back');
    });
  };

  const chooseLanguage = (choice: LanguageChoice) => {
    const previous = language;
    setLanguageChoice(choice);
    startTransition(async () => {
      const result = await setLanguage(choice).catch(() => ({ status: 'error' as const }));
      if (result.status === 'error') {
        setLanguageChoice(previous);
        setSaveError(true);
        return;
      }
      setSaveError(false);
      if (result.uiLocale !== locale) {
        // Reload in the new language so text and direction switch together.
        sessionStorage.setItem(FOCUS_LANGUAGE_KEY, '1');
        router.replace('/onboarding', { locale: result.uiLocale, scroll: false });
      }
    });
  };

  const connect = () => {
    setClaimError(null);
    startTransition(async () => {
      const result = await claimResult(code).catch(() => ({ status: 'error' as const }));
      if (result.status === 'claimed') setResultConnected(true);
      else
        setClaimError(
          result.status === 'not_found'
            ? 'notFound'
            : result.status === 'rate_limited'
              ? 'rateLimited'
              : 'generic',
        );
    });
  };

  // ------------------------------------------------------- primary action
  const primary = (() => {
    switch (key) {
      case 'welcome':
        return { label: t('start'), enabled: true, run: () => complete(false) };
      case 'learn':
        return { label: t('next'), enabled: learningMode !== null, run: () => complete(false) };
      case 'reason':
        return { label: t('next'), enabled: reason !== null, run: () => complete(false) };
      case 'privacy':
        return {
          label: t('agree'),
          enabled: true,
          run: () => {
            if (!agreed) {
              setShowAgreeRequired(true);
              document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
              return;
            }
            complete(false);
          },
        };
      case 'connect':
        // Optional: Next always moves on. Without a result it counts as skipped.
        return { label: t('next'), enabled: true, run: () => complete(!resultConnected) };
      case 'invite':
        return { label: t('continue'), enabled: true, run: () => complete(!invited) };
      case 'done':
        return null;
      default:
        return { label: t('next'), enabled: true, run: () => complete(false) };
    }
  })();

  // Enter moves on when allowed. Buttons, links, fields and the option cards
  // handle Enter themselves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing || pending || !primary?.enabled) return;
      const target = event.target as HTMLElement;
      if (target.closest('button, a, textarea, select, input:not([type="checkbox"]), [role="radio"]'))
        return;
      event.preventDefault();
      primary.run();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, primary]);

  // ----------------------------------------------------------------- view
  const languageOptions = languageChoices.map((value) => ({
    value,
    label: t(`steps.language.options.${value}.label`),
    sub: t(`steps.language.options.${value}.sub`),
    lang: value,
  }));
  const learnOptions = learningModes.map((value) => ({
    value,
    label: t(`steps.learn.options.${value}.label`),
    sub: t(`steps.learn.options.${value}.sub`),
  }));
  const reasonOptions = reasons.map((value) => ({
    value,
    label: t(`steps.reason.options.${value}.label`),
    sub: t(`steps.reason.options.${value}.sub`),
  }));

  const stepLabel = t('stepOf', { step, total: TOTAL_STEPS });

  return (
    <div className="flex min-h-screen flex-col gap-6 px-[clamp(16px,4vw,48px)] pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo size="sm" />
        <div className="flex items-center gap-4">
          <span role="status" aria-live="polite" className="text-sm font-semibold text-muted">
            {stepLabel}
          </span>
          {canSkip(step) ? (
            <button
              type="button"
              onClick={() => complete(true)}
              disabled={pending}
              className="min-h-11 cursor-pointer px-1 text-sm font-bold text-brand-text hover:text-brand-text-dark disabled:cursor-wait"
            >
              {t('skip')}
            </button>
          ) : null}
        </div>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
        <div
          role="progressbar"
          aria-label={t('progressLabel')}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
          aria-valuetext={stepLabel}
          className="h-2 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${progressPercent(step)}%` }}
          />
        </div>

        <section
          aria-labelledby={HEADING_ID}
          aria-busy={pending || undefined}
          className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(24px,4vw,40px)]')}
        >
          <div key={step} className={cn('flex flex-col gap-5', direction === 'forward' ? 'step-forward' : 'step-back')}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <h1
                  id={HEADING_ID}
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-[clamp(26px,4vw,30px)] leading-tight font-extrabold tracking-[-0.02em] focus:outline-none"
                >
                  {title}
                </h1>
                <p className="text-base leading-[1.55] text-muted">{body}</p>
              </div>
              <ListenButton
                speaking={speaking}
                onToggle={() => (speaking ? stopReading() : read(stepText))}
              />
            </div>

            {key === 'welcome' ? <WelcomeArt /> : null}

            {key === 'language' ? (
              <>
                <OptionCards
                  options={languageOptions}
                  value={language}
                  onChange={chooseLanguage}
                  onSubmit={() => complete(false)}
                  labelledBy={HEADING_ID}
                  activation="manual"
                  disabled={pending}
                />
                {!isFullyTranslated(language) ? (
                  <p role="status" className="rounded-tile bg-info-tint px-4 py-3 text-sm font-semibold text-info-text">
                    {t('steps.language.comingSoon')}
                  </p>
                ) : null}
              </>
            ) : null}

            {key === 'learn' ? (
              <OptionCards
                options={learnOptions}
                value={learningMode}
                onChange={setLearningMode}
                onSubmit={() => complete(false)}
                labelledBy={HEADING_ID}
              />
            ) : null}

            {key === 'reason' ? (
              <OptionCards
                options={reasonOptions}
                value={reason}
                onChange={setReason}
                onSubmit={() => complete(false)}
                labelledBy={HEADING_ID}
              />
            ) : null}

            {key === 'privacy' ? (
              <PrivacyStep
                agreed={agreed}
                onAgreedChange={(value) => {
                  setAgreed(value);
                  if (value) setShowAgreeRequired(false);
                }}
                showRequired={showAgreeRequired}
              />
            ) : null}

            {key === 'connect' ? (
              <ConnectResultStep
                code={code}
                onCodeChange={(value) => {
                  setCode(value);
                  setClaimError(null);
                }}
                onConnect={connect}
                connected={resultConnected}
                error={claimError}
                pending={pending}
              />
            ) : null}

            {key === 'invite' ? <InviteStep onInvited={() => setInvited(true)} /> : null}

            {key === 'done' ? (
              <ul className="flex flex-col gap-2.5 rounded-tile bg-bg p-[18px] text-[15px]">
                <DoneItem>
                  {t.rich('steps.done.language', {
                    value: t(`steps.language.options.${language}.label`),
                    // The language name is shown in its own script (e.g. "اردو").
                    lang: (chunks) => <span lang={language}>{chunks}</span>,
                  })}
                </DoneItem>
                <DoneItem>
                  {t('steps.done.learning', {
                    value: t(`steps.learn.options.${learningMode ?? 'read'}.label`),
                  })}
                </DoneItem>
                {(finish?.resultConnected ?? resultConnected) ? (
                  <DoneItem>{t('steps.done.resultConnected')}</DoneItem>
                ) : null}
              </ul>
            ) : null}
          </div>

          {saveError ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {t('saveError')}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap justify-between gap-3">
            {step > 1 ? (
              <Button variant="ghost" onClick={back} disabled={pending}>
                {t('back')}
              </Button>
            ) : null}
            <span className="flex-1" />
            {primary ? (
              <button
                type="button"
                onClick={primary.run}
                disabled={!primary.enabled || pending}
                aria-busy={pending || undefined}
                className={buttonClasses(
                  'primary',
                  'md',
                  'min-w-40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none',
                )}
              >
                {primary.label}
              </button>
            ) : (
              <Button href={finish?.destination ?? '/home'} className="min-w-[200px]">
                {t(`steps.done.cta.${finishKey}`)}
              </Button>
            )}
          </div>
        </section>

        <p className="text-center text-[13px] text-muted">{t('footer')}</p>
      </main>
    </div>
  );
}

function DoneItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <Check aria-hidden="true" className="size-5 flex-none text-unaffected" strokeWidth={2} />
      <span>{children}</span>
    </li>
  );
}

/** The three gene-bead shapes from the design's welcome card. Decorative. */
function WelcomeArt() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-[18px] rounded-[18px] bg-bg p-6">
      <span className="h-[26px] w-14 rotate-30 rounded-full bg-brand" />
      <span className="h-[26px] w-14 -rotate-20 rounded-full bg-brand" />
      <span className="h-[26px] w-14 rotate-60 rounded-full bg-ink" />
    </div>
  );
}
