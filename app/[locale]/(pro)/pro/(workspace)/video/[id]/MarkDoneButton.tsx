'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { markAttended } from '../../../actions';

export function MarkDoneButton({ requestId, done: initiallyDone }: { requestId: string; done: boolean }) {
  const t = useTranslations('pro');
  const [done, setDone] = useState(initiallyDone);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p role="status" className="inline-flex min-h-11 items-center rounded-full bg-success-tint px-4 text-sm font-bold text-success-text">
        {t('video.done')}
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markAttended(requestId);
            if (result.ok) setDone(true);
            else setError(true);
          })
        }
        className={buttonClasses('primary', 'sm', 'disabled:opacity-60')}
      >
        {t('video.markDone')}
      </button>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t('detail.actions.error')}
        </p>
      ) : null}
    </>
  );
}
