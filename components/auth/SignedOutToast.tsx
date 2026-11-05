'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** "You've signed out." on the home page after Sign out, announced politely. */
export function SignedOutToast() {
  const t = useTranslations('common');
  const [show, setShow] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('signed_out') !== '1') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once after mount
    setShow(true);
    url.searchParams.delete('signed_out');
    window.history.replaceState(null, '', url);
    const timer = window.setTimeout(() => setShow(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      {show ? (
        <span data-testid="signed-out-toast" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {t('signedOut')}
        </span>
      ) : null}
    </div>
  );
}
