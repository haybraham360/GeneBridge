'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { suspend } from '../actions';

/** Suspend a professional at any time. Hides them from patients at once and flags their upcoming bookings. */
export function SuspendButton({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations('admin.suspend');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const reasonId = useId();

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses('ghost', 'sm', 'border-danger text-danger')}>
        {t('button')}
      </button>
    );

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-tile border border-line bg-bg p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length < 2) return setError(true);
        startTransition(async () => {
          const result = await suspend(userId, reason).catch(() => ({ status: 'error' as const }));
          if (result.status !== 'ok') return setError(true);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <label htmlFor={reasonId} className="text-sm font-bold">
        {t('reason', { name })}
      </label>
      <textarea id={reasonId} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-input border border-line-strong bg-surface p-3 text-[15px]" />
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{t('error')}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('dark', 'sm')}>
          {t('confirm')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClasses('ghost', 'sm')}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
