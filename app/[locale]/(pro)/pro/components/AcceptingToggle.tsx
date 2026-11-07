'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/cn';
import { setAccepting } from '../kycActions';

/** "Accepting new patients" (task 14). Off by default; only verified professionals see it. */
export function AcceptingToggle({ initial }: { initial: boolean }) {
  const t = useTranslations('verify.accepting');
  const [on, setOn] = useState(initial);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    setError(false);
    startTransition(async () => {
      const result = await setAccepting(next).catch(() => ({ ok: false, accepting: !next }));
      setOn(result.accepting);
      if (!result.ok) setError(true);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 ps-4 pe-1.5">
        <span id="accepting-label" className="text-sm font-bold">
          {t('label')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="accepting-label"
          aria-describedby="accepting-state"
          disabled={pending}
          onClick={toggle}
          className={cn(
            'relative inline-flex h-8 w-14 flex-none cursor-pointer items-center rounded-full transition-colors disabled:cursor-wait',
            on ? 'bg-ink' : 'bg-neutral-line',
          )}
        >
          <span className={cn('inline-block size-6 rounded-full bg-white shadow transition-transform', on ? 'translate-x-7 rtl:-translate-x-7' : 'translate-x-1 rtl:-translate-x-1')} />
        </button>
        <span id="accepting-state" className="min-w-8 text-sm font-semibold text-muted">
          {on ? t('on') : t('off')}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t('error')}
        </p>
      ) : null}
    </div>
  );
}
