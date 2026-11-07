'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { getSlots } from '@/app/[locale]/(app)/dashboard/counsellor/actions';
import { dayLabel, groupByDay, timeLabel, zoneLabel } from '@/lib/booking/time';
import type { SessionFormat, Slot } from '@/lib/booking/types';
import { cn } from '@/lib/cn';
import { useViewerTimeZone } from './useViewerTimeZone';

export const selectButton = (on: boolean) =>
  cn(
    'min-h-12 cursor-pointer rounded-xl border px-3 text-[14px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring',
    on ? 'border-ink bg-ink text-white' : 'border-neutral-200 bg-white text-ink hover:bg-brand/5',
  );

/** Arrow keys move between options in a group, like a radio group. */
function arrowKeys(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
  const forward = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (forward ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
  buttons[next]?.click();
}

/**
 * Day, time and session format from the professional's real free times
 * (computed in the database). Times are shown in the viewer's own time zone,
 * with the zone named.
 */
export function SlotPicker({
  professionalId,
  selected,
  onSelect,
  initialSlots,
}: {
  professionalId: string;
  selected: Slot | null;
  onSelect: (slot: Slot | null) => void;
  initialSlots?: Slot[];
}) {
  const t = useTranslations('booking.panel');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const [slots, setSlots] = useState<Slot[] | null>(initialSlots ?? null);
  const [format, setFormat] = useState<SessionFormat | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(initialSlots ? professionalId : null);

  useEffect(() => {
    if (loadedFor.current === professionalId) return;
    loadedFor.current = professionalId;
    let live = true;
    // Reset while the new professional's times load.
    setSlots(null);
    setDay(null);
    setFormat(null);
    getSlots(professionalId, new Date().toISOString(), 30)
      .then((list) => live && setSlots(list))
      .catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
  }, [professionalId]);

  const formats = useMemo(() => [...new Set((slots ?? []).map((s) => s.format))], [slots]);
  const activeFormat = format && formats.includes(format) ? format : (formats[0] ?? null);
  const days = useMemo(() => groupByDay((slots ?? []).filter((s) => s.format === activeFormat), zone), [slots, activeFormat, zone]);
  const activeDay = days.find((d) => d.day === day) ?? days[0] ?? null;

  if (slots === null) return <p className="mt-5 text-[13px] text-neutral-500" role="status">{t('loading')}</p>;
  if (slots.length === 0) return <p className="mt-5 text-[13px] text-neutral-600" data-testid="no-slots">{t('noSlots')}</p>;

  return (
    <div data-testid="slot-picker">
      {formats.length > 1 ? (
        <Group label={t('session')}>
          <div role="radiogroup" aria-label={t('session')} onKeyDown={arrowKeys} className="grid grid-cols-2 gap-2.5">
            {formats.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={activeFormat === f}
                tabIndex={activeFormat === f ? 0 : -1}
                onClick={() => {
                  setFormat(f);
                  onSelect(null);
                }}
                className={selectButton(activeFormat === f)}
              >
                {t(f)}
              </button>
            ))}
          </div>
        </Group>
      ) : null}

      <Group label={t('day')}>
        <div role="radiogroup" aria-label={t('day')} onKeyDown={arrowKeys} className="grid grid-cols-3 gap-2.5">
          {days.slice(0, 9).map((d) => {
            const on = activeDay?.day === d.day;
            return (
              <button
                key={d.day}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  setDay(d.day);
                  onSelect(null);
                }}
                className={selectButton(on)}
              >
                {dayLabel(d.slots[0].startsAt, zone, locale)}
              </button>
            );
          })}
        </div>
      </Group>

      <Group label={t('time')}>
        <div role="radiogroup" aria-label={t('time')} onKeyDown={arrowKeys} className="grid grid-cols-2 gap-2.5" data-testid="slot-times">
          {(activeDay?.slots ?? []).map((s, i) => {
            const on = selected?.startsAt === s.startsAt && selected.format === s.format;
            const focusable = on || (!selected && i === 0);
            return (
              <button
                key={s.startsAt}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={focusable ? 0 : -1}
                aria-label={`${dayLabel(s.startsAt, zone, locale)} ${timeLabel(s.startsAt, zone, locale)} ${zoneLabel(s.startsAt, zone, locale)}, ${t('minutes', { minutes: s.minutes })}`}
                onClick={() => onSelect(s)}
                className={selectButton(on)}
              >
                <span dir="ltr">{timeLabel(s.startsAt, zone, locale)}</span>
              </button>
            );
          })}
        </div>
      </Group>
      <p className="mt-2 text-[12px] text-neutral-600">
        {t('timesIn', { zone: activeDay ? zoneLabel(activeDay.slots[0].startsAt, zone, locale) : zone })}
        {activeDay ? ` · ${t('minutes', { minutes: activeDay.slots[0].minutes })}` : ''}
      </p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-[13px] font-bold text-ink">{label}</p>
      {children}
    </div>
  );
}
