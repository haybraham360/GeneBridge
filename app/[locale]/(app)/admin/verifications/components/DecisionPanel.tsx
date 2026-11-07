'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { authorities, type Authority } from '@/lib/kyc/types';
import { decide, type DecisionResult } from '../actions';

type Mode = 'approve' | 'needs_more_info' | 'reject';

const field =
  'min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 text-[15px] focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring';

/**
 * Approve (confirming licence number, authority and expiry), request more
 * information, or reject with a reason. A human decides; the pre-check only
 * assists.
 */
export function DecisionPanel({ submissionId, initial }: { submissionId: string; initial: { licenceNumber: string; authority: Authority; expiry: string } }) {
  const t = useTranslations('admin.decision');
  const tl = useTranslations('proOnboarding.labels');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('approve');
  const [licenceNumber, setLicenceNumber] = useState(initial.licenceNumber);
  const [authority, setAuthority] = useState<Authority>(initial.authority);
  const [expiry, setExpiry] = useState(initial.expiry);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const r = await decide(
        submissionId,
        mode === 'approve' ? { kind: 'approve', licenceNumber, authority, expiry } : mode === 'reject' ? { kind: 'reject', reason: message } : { kind: 'needs_more_info', message },
      ).catch((): DecisionResult => ({ status: 'error' }));
      setResult(r);
      if (r.status === 'ok') router.refresh();
    });

  return (
    <section aria-labelledby="decision-title" className={cn(cardClasses, 'flex flex-col gap-4 p-5')}>
      <h2 id="decision-title" className="text-lg font-extrabold">
        {t('title')}
      </h2>
      <div role="radiogroup" aria-label={t('title')} className="flex flex-wrap gap-2">
        {(['approve', 'needs_more_info', 'reject'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold',
              mode === m ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface',
            )}
          >
            {t(`modes.${m}`)}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === 'approve' ? (
          <>
            <p className="text-sm text-muted">{t('confirmNote')}</p>
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('number')}
              <input dir="ltr" value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} className={cn(field, 'text-start rtl:text-right')} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('authority')}
              <select value={authority} onChange={(e) => setAuthority(e.target.value as Authority)} className={cn(field, 'cursor-pointer')}>
                {authorities.map((a) => (
                  <option key={a} value={a}>
                    {tl(`authority.${a}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('expiry')}
              <input type="date" dir="ltr" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={field} />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-bold">
            {mode === 'reject' ? t('reason') : t('message')}
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} className={cn(field, 'py-2')} />
            <span className="font-normal text-muted">{t('messageNote')}</span>
          </label>
        )}

        <p className="text-sm text-muted">{t('deleteNote')}</p>
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses(mode === 'approve' ? 'primary' : 'dark', 'md', 'disabled:cursor-wait disabled:opacity-60')}
        >
          {t(`submit.${mode}`)}
        </button>
        <p role="status" aria-live="polite" className={cn('text-sm font-semibold', result?.status === 'ok' ? 'text-success-text' : 'text-danger')}>
          {result === null
            ? ''
            : result.status === 'ok'
              ? result.documentsDeleted
                ? t('done')
                : t('doneDeletePending')
              : t(result.status)}
        </p>
      </form>
    </section>
  );
}
