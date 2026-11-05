'use client';

import { Bell, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { shortName } from '@/lib/pro/labels';
import type { PatientNotification } from '@/lib/notifications/server';
import { createClient } from '@/lib/supabase/browser';
import { dismissNotification, respondToAccessRequest } from '@/app/[locale]/(app)/dashboard/actions';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Updates from the patient's counsellor: access requests (Share / Not now)
 * and referrals. New ones arrive live; the page then re-reads the care
 * journey too.
 */
export function PatientNotifications({ items, userId }: { items: PatientNotification[]; userId: string }) {
  const t = useTranslations('dashboard.notifications');
  const tt = t as unknown as Translate;
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  if (items.length === 0 && !message) return null;

  const respond = (n: PatientNotification, share: boolean) => {
    const name = shortName(n.counsellorName ?? '');
    setError(false);
    startTransition(async () => {
      const result = await respondToAccessRequest(n.accessRequestId!, share);
      if (!result.ok) setError(true);
      else setMessage(t(share ? 'shared' : 'declined', { name }));
    });
  };

  const dismiss = (n: PatientNotification) =>
    startTransition(async () => {
      if (!(await dismissNotification(n.id)).ok) setError(true);
    });

  const text = (n: PatientNotification) => {
    const name = shortName(n.counsellorName ?? '');
    if (n.kind === 'access_request') return t('accessRequest', { name, resource: tt(`resources.${n.resource}`) });
    if (n.kind === 'referral_created')
      return tt(`referralCreated.${n.step}`, { name, service: n.serviceName ?? '' });
    return t('referralUpdated', { step: tt(`steps.${n.step}`), status: tt(`statuses.${n.referralStatus}`) });
  };

  return (
    <section
      aria-labelledby="notifications-title"
      className="flex flex-col gap-3 rounded-2xl border border-brand-ring bg-brand-tint-soft px-6 py-5"
      data-testid="patient-notifications"
    >
      <h2 id="notifications-title" className="flex items-center gap-2 text-[16px] font-extrabold">
        <Bell aria-hidden="true" className="size-4.5 text-brand-text" strokeWidth={2} />
        {t('title')}
      </h2>
      <ul className="flex flex-col gap-2.5">
        {items.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
            <p className="min-w-0 flex-1 text-[14px]">{text(n)}</p>
            {n.kind === 'access_request' && n.accessStatus === 'pending' ? (
              <span className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => respond(n, true)} className={buttonClasses('primary', 'sm')}>
                  {t('share')}
                </button>
                <button type="button" disabled={pending} onClick={() => respond(n, false)} className={buttonClasses('ghost', 'sm')}>
                  {t('notNow')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => dismiss(n)}
                aria-label={t('dismiss')}
                className="inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-brand-tint"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={2} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className={error ? 'text-[13px] font-semibold text-danger' : 'text-[13px] text-ink-soft'}>
        {error ? t('error') : message}
      </p>
    </section>
  );
}
