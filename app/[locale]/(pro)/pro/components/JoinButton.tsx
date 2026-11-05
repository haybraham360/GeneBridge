'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { startSession } from '../actions';

/** Starts (or rejoins) the session and opens its room in a new tab. */
export function JoinButton({ requestId, label }: { requestId: string; label: string }) {
  const t = useTranslations('pro.detail.actions');
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const tab = window.open('about:blank', '_blank');
        startTransition(async () => {
          const result = await startSession(requestId);
          if (!result.ok) {
            tab?.close();
            window.alert(t('error'));
            return;
          }
          const url = result.data.startsWith('/') ? `/${document.documentElement.lang}${result.data}` : result.data;
          if (tab) tab.location.href = url;
          else window.location.href = url;
        });
      }}
      className={buttonClasses('primary', 'sm', 'disabled:opacity-60')}
    >
      {label}
    </button>
  );
}
