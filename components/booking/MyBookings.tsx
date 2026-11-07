'use client';

import { CalendarClock, MapPin, Video } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { cancelBooking, joinSession, rescheduleBooking } from '@/app/[locale]/(app)/dashboard/counsellor/actions';
import { Link, useRouter } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import { canJoin, isLive, type PatientBooking, type Slot } from '@/lib/booking/types';
import { cn } from '@/lib/cn';
import { SlotPicker } from './SlotPicker';
import { useViewerTimeZone } from './useViewerTimeZone';

const pill: Record<PatientBooking['status'], string> = {
  requested: 'bg-[#FFF1E7] text-[#9A3412]',
  confirmed: 'bg-[#E7F6EC] text-[#166534]',
  declined: 'bg-neutral-100 text-neutral-700',
  cancelled: 'bg-neutral-100 text-neutral-700',
  completed: 'bg-[#E5ECF6] text-[#1E3A8A]',
  no_show: 'bg-neutral-100 text-neutral-700',
};

/** "Your bookings" (task 15, section 4): live bookings first, then history. */
export function MyBookings({ bookings, cutoffHours }: { bookings: PatientBooking[]; cutoffHours: number }) {
  const t = useTranslations('booking.mine');
  const live = bookings.filter((b) => isLive(b.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter((b) => !isLive(b.status)).slice(0, 5);

  return (
    <section className="rounded-2xl bg-white p-6 shadow-card" aria-labelledby="my-bookings" data-testid="my-bookings">
      <h2 id="my-bookings" className="text-[18px] font-extrabold leading-none text-ink">{t('title')}</h2>
      {live.length === 0 ? <p className="mt-4 text-[13px] text-neutral-600">{t('empty')}</p> : null}
      <ul className="mt-4 flex flex-col gap-3">
        {live.map((b) => (
          <BookingRow key={b.id} booking={b} />
        ))}
      </ul>
      {live.length > 0 ? <p className="mt-3 text-[12px] text-neutral-500">{t('cutoff', { hours: cutoffHours })}</p> : null}
      {past.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-bold text-ink">{t('past')}</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function BookingRow({ booking: b }: { booking: PatientBooking }) {
  const t = useTranslations('booking.mine');
  const tp = useTranslations('booking.panel');
  const tErr = useTranslations('booking.panel.errors');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'cancel' | 'reschedule'>('idle');
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Re-check the join window every 30 seconds, so the button appears on time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const live = isLive(b.status);
  const joinable = canJoin(b, now);
  const name = b.professionalName ?? '';

  const run = (fn: () => Promise<{ status: string }>, done: string) =>
    startTransition(async () => {
      const result = await fn().catch(() => ({ status: 'error' }));
      if (result.status === 'ok') {
        setMessage({ ok: true, text: done });
        setMode('idle');
        router.refresh();
      } else {
        setMessage({ ok: false, text: tErr(result.status as 'error') });
      }
    });

  const join = () =>
    startTransition(async () => {
      const result = await joinSession(b.id);
      if ('url' in result) window.open(result.url, '_blank', 'noopener,noreferrer');
    });

  return (
    <li className="rounded-xl border border-neutral-200 p-4" data-testid="booking-row" data-status={b.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-ink">{t('with', { name })}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-neutral-600">
            <CalendarClock aria-hidden className="size-3.5" />
            <span>{whenLabel(b.startsAt, zone, locale)}</span>
            <span aria-hidden>·</span>
            {b.format === 'video' ? <Video aria-hidden className="size-3.5" /> : <MapPin aria-hidden className="size-3.5" />}
            <span>{tp(b.format)}</span>
          </p>
        </div>
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', pill[b.status])} data-testid="booking-status-pill">
          {t(`status.${b.status}`)}
        </span>
      </div>

      <p className="mt-2 text-[12px] text-neutral-600">
        {b.shared.length ? t('shared', { items: b.shared.map((s) => tp(`share.${s}`)).join(', ') }) : t('nothingShared')}
        {b.familyInvited ? ` · ${t('family')}` : ''}
      </p>
      {b.changedBy === 'professional' && b.changeReason ? (
        <p className="mt-1 text-[12px] text-neutral-700">
          {t('changedByProfessional')} {t('changedReason', { reason: b.changeReason })}
        </p>
      ) : null}

      {live && !b.professionalAvailable ? (
        <p role="note" className="mt-2 text-[13px] font-semibold text-red-700">
          {t('unavailable')}
        </p>
      ) : null}

      {b.status === 'confirmed' ? (
        <div className="mt-3">
          {b.format === 'in_person' ? (
            <p className="text-[12px] text-neutral-600">{t('inPersonNote')}</p>
          ) : joinable ? (
            <button type="button" onClick={join} disabled={pending} data-testid="join-call" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-bold text-white hover:bg-[#2E2A27]">
              <Video aria-hidden className="size-4" />
              {t('join')}
            </button>
          ) : (
            <p className="text-[12px] text-neutral-600" data-testid="link-later">
              {b.meetingUrl ? t('joinOpens') : t('linkLater')}
            </p>
          )}
        </div>
      ) : null}

      {live ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/dashboard/messages?with=${b.professionalId}`} className="inline-flex min-h-11 items-center rounded-full border border-neutral-300 px-4 text-[13px] font-bold text-ink no-underline hover:bg-brand/5">
            {t('message')}
          </Link>
          <button type="button" onClick={() => setMode(mode === 'reschedule' ? 'idle' : 'reschedule')} className="min-h-11 cursor-pointer rounded-full border border-neutral-300 px-4 text-[13px] font-bold text-ink hover:bg-brand/5">
            {t('reschedule')}
          </button>
          <button type="button" onClick={() => setMode(mode === 'cancel' ? 'idle' : 'cancel')} className="min-h-11 cursor-pointer rounded-full border border-red-600 px-4 text-[13px] font-bold text-red-700 hover:bg-red-50">
            {t('cancel')}
          </button>
        </div>
      ) : null}

      {mode === 'cancel' ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
          <p className="text-[13px] font-bold">{t('cancelTitle')}</p>
          <label className="text-[12px] font-semibold text-neutral-700">
            {t('reason')}
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} dir="auto" className="mt-1 block min-h-11 w-full rounded-input border border-neutral-300 bg-white px-3 text-[14px]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => cancelBooking(b.id, reason), t('done.cancelled'))} className="min-h-11 cursor-pointer rounded-full bg-red-700 px-4 text-[13px] font-bold text-white">
              {t('confirmCancel')}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="min-h-11 cursor-pointer rounded-full border border-neutral-300 px-4 text-[13px] font-bold">
              {t('keep')}
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'reschedule' ? (
        <div className="mt-3 rounded-xl bg-neutral-50 p-3">
          <p className="text-[13px] font-bold">{t('rescheduleTitle')}</p>
          <SlotPicker professionalId={b.professionalId} selected={slot} onSelect={setSlot} />
          <label className="mt-3 block text-[12px] font-semibold text-neutral-700">
            {t('reason')}
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} dir="auto" className="mt-1 block min-h-11 w-full rounded-input border border-neutral-300 bg-white px-3 text-[14px]" />
          </label>
          <button
            type="button"
            disabled={!slot || pending}
            onClick={() => slot && run(() => rescheduleBooking(b.id, slot.startsAt, reason), t('done.rescheduled'))}
            className="mt-3 min-h-11 cursor-pointer rounded-full bg-brand px-5 text-[13px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('moveTo')}
          </button>
        </div>
      ) : null}

      {message ? (
        <p role="status" aria-live="polite" className={cn('mt-2 text-[12px] font-semibold', message.ok ? 'text-[#166534]' : 'text-red-700')}>
          {message.text}
        </p>
      ) : null}
    </li>
  );
}
