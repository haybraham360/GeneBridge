'use client';

import { Video } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { joinSession } from '@/app/[locale]/(app)/dashboard/counsellor/actions';
import { Link } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import { canJoin, type PatientBooking } from '@/lib/booking/types';
import { useViewerTimeZone } from './useViewerTimeZone';

/**
 * The patient's next session on Home, next to the care tracker (task 15,
 * section 4). Updates live; "Join video call" appears 10 minutes before.
 */
export function NextSession({ booking: b }: { booking: PatientBooking }) {
  const t = useTranslations('booking.mine');
  const tp = useTranslations('booking.panel');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const [now, setNow] = useState(() => new Date());
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-card" data-testid="next-session" data-status={b.status} aria-label={t('title')}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-[#1E3A8A]">{t(`status.${b.status}`)}</p>
        <p className="text-[15px] font-extrabold text-ink">{t('with', { name: b.professionalName ?? '' })}</p>
        <p className="text-[13px] text-neutral-600">
          {whenLabel(b.startsAt, zone, locale)} · {tp(b.format)}
        </p>
      </div>
      {b.status === 'confirmed' && b.format === 'video' ? (
        canJoin(b, now) ? (
          <button
            type="button"
            disabled={pending}
            data-testid="join-call"
            onClick={() =>
              startTransition(async () => {
                const result = await joinSession(b.id);
                if ('url' in result) window.open(result.url, '_blank', 'noopener,noreferrer');
              })
            }
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-bold text-white"
          >
            <Video aria-hidden className="size-4" />
            {t('join')}
          </button>
        ) : (
          <p className="max-w-60 text-[12px] text-neutral-600">{b.meetingUrl ? t('joinOpens') : t('linkLater')}</p>
        )
      ) : null}
      <Link href="/dashboard/counsellor" className="text-[13px] font-bold text-[#C2410C] underline">
        {t('title')}
      </Link>
    </section>
  );
}
