'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { offerRequest } from '@/app/[locale]/(pro)/pro/bookingActions';
import { useRouter } from '@/i18n/navigation';
import type { OpenRequest } from '@/lib/booking/server';
import { cn } from '@/lib/cn';

/**
 * Open requests from patients who speak one of the professional's
 * languages (task 15, section 2): topic, urgency and language only. The
 * professional offers; the patient chooses.
 */
export function OpenRequestsPanel({ requests, accepting }: { requests: OpenRequest[]; accepting: boolean }) {
  const t = useTranslations('booking.pro.openRequests');
  const tr = useTranslations('pro.topics');
  const te = useTranslations('booking.pro');
  const locale = useLocale();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const langName = useMemo(() => {
    const dn = new Intl.DisplayNames(locale, { type: 'language' });
    return (code: string) => dn.of(code) ?? code;
  }, [locale]);
  const topic = tr as unknown as (key: string) => string;

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card" aria-labelledby="open-requests" data-testid="open-requests">
      <h2 id="open-requests" className="text-lg font-extrabold">{t('title')}</h2>
      <p className="text-sm text-muted">{t('body')}</p>
      {!accepting ? <p className="text-sm font-semibold">{t('notAccepting')}</p> : null}
      {requests.length === 0 ? <p className="text-sm text-muted">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-2">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-tile border border-line p-3">
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="font-bold">{safe(topic, r.reason, r.reason)}</span>
              {r.urgency === 'priority' ? <span className="ms-2 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-text-dark">{t('priority')}</span> : null}
              <span className="block text-[12px] text-muted">{t('language', { language: langName(r.language) })}</span>
            </span>
            <button
              type="button"
              disabled={!accepting || r.offered || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await offerRequest(r.id).catch(() => ({ status: 'error' as const }));
                  setFailed(result.status !== 'ok');
                  router.refresh();
                })
              }
              className={cn('min-h-11 cursor-pointer rounded-full px-4 text-[13px] font-bold disabled:cursor-not-allowed', r.offered ? 'bg-success-tint text-success-text' : 'bg-ink text-white disabled:opacity-50')}
            >
              {r.offered ? t('offered') : t('offer')}
            </button>
          </li>
        ))}
      </ul>
      {failed ? <p role="alert" className="text-sm font-semibold text-danger">{te('error')}</p> : null}
    </section>
  );
}

function safe(t: (key: string) => string, key: string, fallback: string): string {
  try {
    return t(key);
  } catch {
    return fallback;
  }
}
