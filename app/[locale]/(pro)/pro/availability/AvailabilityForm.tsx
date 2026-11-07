'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { saveAvailability, type Slot } from '../kycActions';

/** Monday first, as in the UAE working week; weekday numbers follow JavaScript (0 = Sunday). */
const weekdays = [1, 2, 3, 4, 5, 6, 0] as const;

type Day = { on: boolean; startsAt: string; endsAt: string };

const timeClasses =
  'min-h-11 rounded-input border border-line-strong bg-surface px-3 text-base text-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring disabled:opacity-50';

/** One block of hours per day: simple to set, enough for task 15's booking. */
export function AvailabilityForm({ initial }: { initial: Slot[] }) {
  const t = useTranslations('verify.availability');
  const [days, setDays] = useState<Record<number, Day>>(() =>
    Object.fromEntries(
      weekdays.map((d) => {
        const slot = initial.find((s) => s.weekday === d);
        return [d, slot ? { on: true, startsAt: slot.startsAt, endsAt: slot.endsAt } : { on: false, startsAt: '09:00', endsAt: '17:00' }];
      }),
    ),
  );
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  const set = (d: number, patch: Partial<Day>) => setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }));

  const save = () => {
    const slots = weekdays.filter((d) => days[d].on).map((d) => ({ weekday: d, startsAt: days[d].startsAt, endsAt: days[d].endsAt }));
    if (slots.some((s) => s.endsAt <= s.startsAt)) return setStatus('invalid');
    startTransition(async () => {
      const result = await saveAvailability(slots).catch(() => ({ status: 'error' as const }));
      setStatus(result.status === 'ok' ? 'saved' : result.status);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className={cn(cardClasses, 'flex max-w-2xl flex-col gap-4 p-[clamp(20px,3vw,32px)]')}
    >
      <ul className="flex flex-col divide-y divide-line">
        {weekdays.map((d) => (
          <li key={d} className="flex flex-wrap items-center gap-3 py-3">
            <label className="flex min-h-11 min-w-36 cursor-pointer items-center gap-3 text-[15px] font-bold">
              <input type="checkbox" checked={days[d].on} onChange={(e) => set(d, { on: e.target.checked })} className="size-5 cursor-pointer accent-ink" />
              {t(`days.${d}`)}
            </label>
            <div dir="ltr" className="flex items-center gap-2">
              <input
                type="time"
                aria-label={t('from', { day: t(`days.${d}`) })}
                value={days[d].startsAt}
                disabled={!days[d].on}
                onChange={(e) => set(d, { startsAt: e.target.value })}
                className={timeClasses}
              />
              <span aria-hidden="true">–</span>
              <input
                type="time"
                aria-label={t('to', { day: t(`days.${d}`) })}
                value={days[d].endsAt}
                disabled={!days[d].on}
                onChange={(e) => set(d, { endsAt: e.target.value })}
                className={timeClasses}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'min-w-40 disabled:cursor-wait disabled:opacity-60')}>
          {t('save')}
        </button>
        <p role="status" aria-live="polite" className={cn('text-sm font-semibold', status === 'saved' ? 'text-success-text' : 'text-danger')}>
          {status === 'idle' ? '' : t(`status.${status}`)}
        </p>
      </div>
    </form>
  );
}
