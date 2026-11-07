'use client';

import { Video } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import {
  cancelAsProfessional,
  completeBooking,
  joinAsProfessional,
  respondBooking,
  setMeetingLink,
} from '@/app/[locale]/(pro)/pro/bookingActions';
import { Link, useRouter } from '@/i18n/navigation';
import { dayLabel, timeLabel } from '@/lib/booking/time';
import { canJoin, isLive, type ProBooking } from '@/lib/booking/types';
import { cn } from '@/lib/cn';

const btn = 'min-h-11 cursor-pointer rounded-full px-4 text-[13px] font-bold disabled:cursor-wait disabled:opacity-60';

/** One booking in /pro/sessions, with the actions its status allows. */
export function ProBookingCard({ booking: b, timeZone, showDay = false, googleConnected }: { booking: ProBooking; timeZone: string; showDay?: boolean; googleConnected: boolean }) {
  const t = useTranslations('booking.pro');
  const tm = useTranslations('booking.mine');
  const tp = useTranslations('booking.panel');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'decline' | 'cancel' | 'link'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const run = (fn: () => Promise<{ status: string }>, invalidKey: 'error' | 'linkInvalid' = 'error') =>
    startTransition(async () => {
      const result = await fn().catch(() => ({ status: 'error' }));
      if (result.status === 'ok') {
        setMode('idle');
        setText('');
        setError(null);
        router.refresh();
      } else {
        setError(result.status === 'invalid' ? t(invalidKey) : t('error'));
      }
    });

  const started = Date.parse(b.startsAt) <= now.getTime();

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card" data-testid="pro-booking" data-status={b.status}>
      <div className="flex flex-wrap items-center gap-4">
        <span className="min-w-16 text-xl font-extrabold tabular-nums" dir="ltr">
          {timeLabel(b.startsAt, timeZone, locale)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-extrabold">{b.patientName}</span>
          <span className="text-sm text-muted">
            {showDay ? `${dayLabel(b.startsAt, timeZone, locale)} · ` : ''}
            {tp(b.format)} · {tm(`status.${b.status}`)}
            {b.partnerInvited ? ` · ${t('partner')}` : ''}
            {b.familyInvited ? ` · ${t('family')}` : ''}
          </span>
          <span className="text-[12px] text-muted">
            {b.shared.length ? t('shared', { items: b.shared.map((s) => tp(`share.${s}`)).join(', ') }) : t('nothingShared')}
          </span>
          {b.changeReason && b.changedBy === 'patient' ? (
            <span className="text-[12px] text-ink" dir="auto">{tm('changedReason', { reason: b.changeReason })}</span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {b.requestId ? (
            <Link href={`/pro?request=${b.requestId}`} className="text-sm font-semibold text-brand-text underline">
              {t('openRequest')}
            </Link>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {b.status === 'requested' ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => respondBooking(b.id, true))} className={cn(btn, 'bg-ink text-white')} data-testid="confirm-request">
              {t('confirm')}
            </button>
            <button type="button" disabled={pending} onClick={() => setMode(mode === 'decline' ? 'idle' : 'decline')} className={cn(btn, 'border border-line-strong bg-surface')}>
              {t('decline')}
            </button>
          </>
        ) : null}

        {b.status === 'confirmed' && b.format === 'video' && canJoin(b, now) ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await joinAsProfessional(b.id);
                if ('url' in result) window.open(result.url, '_blank', 'noopener,noreferrer');
              })
            }
            className={cn(btn, 'inline-flex items-center gap-2 bg-ink text-white')}
          >
            <Video aria-hidden className="size-4" /> {t('join')}
          </button>
        ) : null}

        {b.status === 'confirmed' && b.format === 'video' && !b.meetingUrl ? (
          <button type="button" onClick={() => setMode(mode === 'link' ? 'idle' : 'link')} className={cn(btn, 'border border-line-strong bg-surface')} data-testid="add-link">
            {t('addLink')}
          </button>
        ) : null}
        {b.meetLinkStatus === 'created' ? <span className="self-center text-[12px] font-semibold text-success-text">{t('googleLink')}</span> : null}

        {b.status === 'confirmed' && started ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => completeBooking(b.id, 'completed'))} className={cn(btn, 'border border-line-strong bg-surface')}>
              {t('markCompleted')}
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => completeBooking(b.id, 'no_show'))} className={cn(btn, 'border border-line-strong bg-surface')}>
              {t('markNoShow')}
            </button>
          </>
        ) : null}

        {isLive(b.status) && !started ? (
          <button type="button" onClick={() => setMode(mode === 'cancel' ? 'idle' : 'cancel')} className={cn(btn, 'border border-danger text-danger')}>
            {t('cancel')}
          </button>
        ) : null}
      </div>

      {mode === 'decline' || mode === 'cancel' ? (
        <div className="flex flex-col gap-2 rounded-tile bg-bg p-3">
          <label className="text-sm font-bold">
            {mode === 'decline' ? t('declineReason') : t('cancelReason')}
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} dir="auto" className="mt-1 block min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 text-[15px] font-normal" />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || (mode === 'cancel' && !text.trim())}
              onClick={() => run(() => (mode === 'decline' ? respondBooking(b.id, false, text) : cancelAsProfessional(b.id, text)))}
              className={cn(btn, 'bg-ink text-white')}
            >
              {mode === 'decline' ? t('confirmDecline') : t('confirmCancel')}
            </button>
            <button type="button" onClick={() => setMode('idle')} className={cn(btn, 'border border-line-strong bg-surface')}>
              {t('keep')}
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'link' ? (
        <div className="flex flex-col gap-2 rounded-tile bg-bg p-3">
          <label className="text-sm font-bold">
            {t('linkLabel')}
            <input type="url" inputMode="url" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://" dir="ltr" className="mt-1 block min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 text-[15px] font-normal" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => setMeetingLink(b.id, text), 'linkInvalid')} className={cn(btn, 'bg-ink text-white')}>
              {t('saveLink')}
            </button>
            {!googleConnected ? (
              <Link href="/pro/settings" className="text-[13px] font-semibold text-brand-text underline">
                {t('connectGoogle')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
    </li>
  );
}
