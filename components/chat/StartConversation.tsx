'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { openConversation } from '@/app/[locale]/chatActions';
import { Link, useRouter } from '@/i18n/navigation';

/**
 * Opens (or reopens) the conversation with a professional, then shows it.
 * Runs in the browser after the patient pressed "Message", so link
 * prefetching can never start a conversation.
 */
export function StartConversation({ professionalId }: { professionalId: string }) {
  const t = useTranslations('chat');
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void openConversation(professionalId).then((result) => {
      if ('id' in result) router.replace(`/dashboard/messages/${result.id}`);
      else setFailed(true);
    });
  }, [professionalId, router]);
  if (!failed) return <p role="status" className="text-[14px] text-neutral-600">…</p>;
  return (
    <p role="alert" className="text-[14px] font-semibold text-red-700">
      {t('startError')} <Link href="/dashboard/counsellor" className="underline">{t('chooseAnother')}</Link>
    </p>
  );
}
