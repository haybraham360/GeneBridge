'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition, type Ref } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { programmeDay } from '@/lib/pro/queue';
import { outcomes, type Outcome } from '@/lib/pro/types';
import { closeRequest } from '../actions';
import { dialogClasses } from './dialog';

type Props = { ref: Ref<HTMLDialogElement>; requestId: string; onClosed: () => void };

/**
 * Closing records an outcome category and an optional follow-up date only.
 * There is deliberately no option about marriage, relationships or
 * reproductive decisions (guardrail 11).
 */
export function CloseDialog({ ref, requestId, onClosed }: Props) {
  const t = useTranslations('pro.close');
  const tActions = useTranslations('pro.detail.actions');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState<'required' | 'failed' | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <dialog
      ref={ref}
      aria-labelledby="close-title"
      className={dialogClasses}
      onClose={() => {
        setOutcome(null);
        setFollowUp('');
        setError(null);
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const dialog = event.currentTarget.closest('dialog');
          if (!outcome) {
            setError('required');
            return;
          }
          startTransition(async () => {
            const result = await closeRequest({ requestId, outcome, followUpOn: followUp || null });
            if (!result.ok) {
              setError('failed');
              return;
            }
            dialog?.close();
            onClosed();
          });
        }}
      >
        <div>
          <h2 id="close-title" className="text-xl font-extrabold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('body')}</p>
        </div>
        <fieldset className="flex flex-col gap-2" aria-describedby={error === 'required' ? 'close-error' : undefined}>
          <legend className="mb-1 text-sm font-bold">{t('legend')}</legend>
          {outcomes.map((o) => (
            <label
              key={o}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 text-sm has-checked:border-ink has-checked:bg-brand-tint-soft"
            >
              <input
                type="radio"
                name="outcome"
                value={o}
                checked={outcome === o}
                onChange={() => {
                  setOutcome(o);
                  setError(null);
                }}
                className="size-4 accent-ink"
              />
              {t(`outcomes.${o}`)}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`follow-up-${requestId}`} className="text-sm font-bold">
            {t('followUp')}
          </label>
          <input
            id={`follow-up-${requestId}`}
            type="date"
            value={followUp}
            min={programmeDay(new Date())}
            onChange={(e) => setFollowUp(e.target.value)}
            className="min-h-11 rounded-input border border-line-strong px-3.5 text-[15px]"
          />
        </div>
        {error ? (
          <p id="close-error" role="alert" className="text-[13px] font-semibold text-danger">
            {error === 'required' ? t('required') : tActions('error')}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={(e) => e.currentTarget.closest('dialog')?.close()}
            className={buttonClasses('ghost', 'sm')}
          >
            {t('cancel')}
          </button>
          <button type="submit" disabled={pending} className={buttonClasses('dark', 'sm', 'disabled:opacity-60')}>
            {t('submit')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
