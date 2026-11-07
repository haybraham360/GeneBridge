'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { markNotificationsRead } from '../kycActions';

export function MarkRead() {
  const t = useTranslations('verify.notifications');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationsRead().catch(() => undefined);
          router.refresh();
        })
      }
      className={buttonClasses('ghost', 'sm', 'self-start')}
    >
      {t('markRead')}
    </button>
  );
}
