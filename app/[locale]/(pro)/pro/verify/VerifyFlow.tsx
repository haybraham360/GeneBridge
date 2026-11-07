'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { authorities, MAX_PAGES, type Authority } from '@/lib/kyc/types';
import { submitVerification, type SubmitResult } from './actions';
import { DocumentCapture, type Captured } from './DocumentCapture';

const steps = ['details', 'licence', 'id', 'selfie', 'review'] as const;
type Step = (typeof steps)[number];
type Field = 'licenceNumber' | 'authority' | 'authorityOther' | 'expiry' | 'consent' | 'licence' | 'id';

const inputClasses =
  'min-h-[52px] w-full min-w-0 rounded-input border border-line-strong bg-surface px-4 text-base text-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring aria-[invalid=true]:border-danger';

export type VerifyInitial = {
  licenceNumber: string;
  authority: Authority | '';
  authorityOther: string;
  expiry: string;
};

/** Uploads one page; the server re-encodes and encrypts it. */
async function uploadPage(draft: string, kind: 'licence' | 'id' | 'selfie', page: number, blob: Blob): Promise<boolean> {
  const form = new FormData();
  form.set('draft', draft);
  form.set('kind', kind);
  form.set('page', String(page));
  form.set('file', blob, `${kind}-${page}`);
  const res = await fetch('/api/kyc/upload', { method: 'POST', body: form }).catch(() => null);
  return Boolean(res?.ok);
}

/**
 * Licence verification (task 14, section 5): one step per screen, in the
 * GeneBridge card style. Documents stay in the browser until "Submit", then
 * go to the server one page at a time.
 */
export function VerifyFlow({ initial, today }: { initial: VerifyInitial; today: string }) {
  const t = useTranslations('verify.flow');
  const tl = useTranslations('proOnboarding.labels');
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [details, setDetails] = useState(initial);
  const [licence, setLicence] = useState<Captured[]>([]);
  const [id, setId] = useState<Captured[]>([]);
  const [selfie, setSelfie] = useState<Captured[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, true>>>({});
  const [failure, setFailure] = useState<'upload' | 'not_allowed' | 'error' | null>(null);
  const [progress, setProgress] = useState('');
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const step: Step = steps[stepIndex];

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stepIndex]);

  const check = (s: Step): Partial<Record<Field, true>> => {
    const e: Partial<Record<Field, true>> = {};
    if (s === 'details') {
      if (details.licenceNumber.trim().length < 2) e.licenceNumber = true;
      if (!details.authority) e.authority = true;
      if (details.authority === 'other' && details.authorityOther.trim().length < 2) e.authorityOther = true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(details.expiry) || details.expiry <= today) e.expiry = true;
    }
    if (s === 'licence' && licence.length === 0) e.licence = true;
    if (s === 'id' && id.length === 0) e.id = true;
    if (s === 'review' && !consent) e.consent = true;
    return e;
  };

  const next = () => {
    const e = check(step);
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"]')?.focus());
      return;
    }
    if (step !== 'review') return setStepIndex((i) => i + 1);
    submit();
  };

  const submit = () =>
    startTransition(async () => {
      setFailure(null);
      // A fresh draft folder per attempt, so a failed attempt never mixes in.
      const draft = crypto.randomUUID();
      const all: [typeof licence, 'licence' | 'id' | 'selfie'][] = [
        [licence, 'licence'],
        [id, 'id'],
        [selfie, 'selfie'],
      ];
      const total = licence.length + id.length + selfie.length;
      let done = 0;
      for (const [pages, kind] of all) {
        for (let i = 0; i < pages.length; i++) {
          setProgress(t('uploading', { done, total }));
          if (!(await uploadPage(draft, kind, i + 1, pages[i].blob))) {
            setProgress('');
            return setFailure('upload');
          }
          done++;
        }
      }
      setProgress(t('checking'));
      const result = await submitVerification({
        draftId: draft,
        licenceNumber: details.licenceNumber,
        authority: details.authority,
        authorityOther: details.authorityOther,
        expiry: details.expiry,
        consent,
      }).catch((): SubmitResult => ({ status: 'error' }));
      setProgress('');
      if (result.status === 'ok') {
        router.replace('/pro/verify/submission?sent=1');
        router.refresh();
        return;
      }
      if (result.status === 'invalid') {
        setErrors({ [result.field]: true });
        setStepIndex(result.field === 'licence' ? 1 : result.field === 'id' ? 2 : result.field === 'consent' ? 4 : 0);
        return;
      }
      setFailure(result.status === 'not_allowed' ? 'not_allowed' : 'error');
    });

  const stepLabel = t('stepOf', { step: stepIndex + 1, total: steps.length });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div
        role="progressbar"
        aria-label={t('progressLabel')}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={stepIndex + 1}
        aria-valuetext={stepLabel}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        aria-busy={pending || undefined}
        className={cn(cardClasses, 'flex flex-col gap-5 p-[clamp(20px,4vw,40px)]')}
      >
        <div key={step} className="step-forward flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted" aria-live="polite">
              {stepLabel}
            </p>
            <h1 ref={headingRef} tabIndex={-1} className="text-[clamp(24px,4vw,30px)] leading-tight font-extrabold tracking-[-0.02em] focus:outline-none">
              {t(`${step}.title`)}
            </h1>
            <p className="text-base text-muted">{t(`${step}.body`)}</p>
          </div>

          {step === 'details' ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="licenceNumber" className="text-sm font-bold">
                  {t('details.number')}
                </label>
                <input
                  id="licenceNumber"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={details.licenceNumber}
                  onChange={(e) => setDetails({ ...details, licenceNumber: e.target.value.slice(0, 64) })}
                  aria-invalid={errors.licenceNumber || undefined}
                  className={cn(inputClasses, 'text-start rtl:text-right')}
                />
                {errors.licenceNumber ? <p className="text-sm font-semibold text-danger">{t('errors.licenceNumber')}</p> : null}
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="authority" className="text-sm font-bold">
                  {t('details.authority')}
                </label>
                <select
                  id="authority"
                  value={details.authority}
                  onChange={(e) => setDetails({ ...details, authority: e.target.value as Authority | '' })}
                  aria-invalid={errors.authority || undefined}
                  className={cn(inputClasses, 'cursor-pointer')}
                >
                  <option value="">{t('details.choose')}</option>
                  {authorities.map((a) => (
                    <option key={a} value={a}>
                      {tl(`authority.${a}`)}
                    </option>
                  ))}
                </select>
                {errors.authority ? <p className="text-sm font-semibold text-danger">{t('errors.authority')}</p> : null}
              </div>
              {details.authority === 'other' ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor="authorityOther" className="text-sm font-bold">
                    {t('details.authorityOther')}
                  </label>
                  <input
                    id="authorityOther"
                    value={details.authorityOther}
                    onChange={(e) => setDetails({ ...details, authorityOther: e.target.value.slice(0, 120) })}
                    aria-invalid={errors.authorityOther || undefined}
                    className={inputClasses}
                  />
                  {errors.authorityOther ? <p className="text-sm font-semibold text-danger">{t('errors.authorityOther')}</p> : null}
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <label htmlFor="expiry" className="text-sm font-bold">
                  {t('details.expiry')}
                </label>
                <input
                  id="expiry"
                  type="date"
                  dir="ltr"
                  min={today}
                  value={details.expiry}
                  onChange={(e) => setDetails({ ...details, expiry: e.target.value })}
                  aria-invalid={errors.expiry || undefined}
                  className={cn(inputClasses, 'max-w-60')}
                />
                {errors.expiry ? <p className="text-sm font-semibold text-danger">{t('errors.expiry')}</p> : null}
              </div>
            </div>
          ) : null}

          {step === 'licence' ? (
            <div data-error={errors.licence || undefined} tabIndex={errors.licence ? -1 : undefined} className="flex flex-col gap-2 outline-none">
              <DocumentCapture pages={licence} onChange={setLicence} maxPages={MAX_PAGES.licence} allowPdf hint={t('licence.hint')} />
              {errors.licence ? <p className="text-sm font-semibold text-danger">{t('errors.licence')}</p> : null}
            </div>
          ) : null}

          {step === 'id' ? (
            <div data-error={errors.id || undefined} tabIndex={errors.id ? -1 : undefined} className="flex flex-col gap-2 outline-none">
              <DocumentCapture
                pages={id}
                onChange={setId}
                maxPages={MAX_PAGES.id}
                slotLabels={[t('id.front'), t('id.back')]}
                hint={t('id.hint')}
              />
              {errors.id ? <p className="text-sm font-semibold text-danger">{t('errors.id')}</p> : null}
            </div>
          ) : null}

          {step === 'selfie' ? (
            <DocumentCapture pages={selfie} onChange={setSelfie} maxPages={MAX_PAGES.selfie} facing="user" hint={t('selfie.hint')} />
          ) : null}

          {step === 'review' ? (
            <div className="flex flex-col gap-4">
              <dl className="grid gap-x-6 gap-y-3 rounded-tile bg-bg p-4 text-[15px] sm:grid-cols-[auto_1fr]">
                <dt className="font-bold">{t('details.number')}</dt>
                <dd>
                  <bdi dir="ltr">{details.licenceNumber}</bdi>
                </dd>
                <dt className="font-bold">{t('details.authority')}</dt>
                <dd>{details.authority === 'other' ? details.authorityOther : details.authority ? tl(`authority.${details.authority}`) : ''}</dd>
                <dt className="font-bold">{t('details.expiry')}</dt>
                <dd>
                  <bdi dir="ltr">{details.expiry}</bdi>
                </dd>
                <dt className="font-bold">{t('review.documents')}</dt>
                <dd>{t('review.counts', { licence: licence.length, id: id.length, selfie: selfie.length })}</dd>
              </dl>
              <p className="flex items-start gap-2 text-sm text-muted">
                <Lock aria-hidden="true" className="mt-0.5 size-4 flex-none" />
                {t('review.privacy')}
              </p>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-tile border p-4 text-[15px] leading-[1.5]',
                  errors.consent ? 'border-danger bg-brand-tint-soft' : consent ? 'border-ink bg-surface' : 'border-line bg-surface',
                )}
              >
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setErrors({});
                  }}
                  aria-invalid={errors.consent || undefined}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-ink"
                />
                <span>{t('review.consent')}</span>
              </label>
              {errors.consent ? <p className="text-sm font-semibold text-danger">{t('errors.consent')}</p> : null}
            </div>
          ) : null}
        </div>

        <p aria-live="polite" className="text-sm font-semibold text-muted">
          {progress}
        </p>
        {failure ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {t(`failure.${failure}`)}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-between gap-3">
          {stepIndex > 0 ? (
            <Button variant="ghost" onClick={() => setStepIndex((i) => i - 1)} disabled={pending}>
              {t('back')}
            </Button>
          ) : (
            <Button variant="ghost" href="/pro">
              {t('later')}
            </Button>
          )}
          <span className="flex-1" />
          {step === 'selfie' && selfie.length === 0 ? (
            <button type="button" onClick={() => setStepIndex((i) => i + 1)} className={buttonClasses('ghost', 'md')}>
              {t('selfie.skip')}
            </button>
          ) : null}
          <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'min-w-40 disabled:cursor-wait disabled:opacity-60')}>
            {step === 'review' ? (pending ? t('submitting') : t('submit')) : t('next')}
          </button>
        </div>
      </form>
    </div>
  );
}
