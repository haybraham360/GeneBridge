'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { removeDemoAccount } from '../actions';

/** Removes one demo account and everything linked to it, after a second click. */
export function RemoveDemoAccount({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations('admin.demoData.removeOne');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={t('buttonAria', { name })}
        className={buttonClasses('ghost', 'sm', 'border-danger text-danger')}
      >
        {t('button')}
      </button>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">{t('question', { name })}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeDemoAccount(userId).catch(() => ({ status: 'error' as const }));
            if (result.status !== 'ok') return setError(true);
            router.refresh();
          })
        }
        className={buttonClasses('dark', 'sm')}
      >
        {pending ? t('working') : t('confirm')}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={buttonClasses('ghost', 'sm')}>
        {t('cancel')}
      </button>
      {error ? <p role="alert" className="w-full text-sm font-semibold text-danger">{t('error')}</p> : null}
    </div>
  );
}
