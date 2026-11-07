'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { useRouter } from '@/i18n/navigation';
import { sessionLengths, type SessionFormat, type SessionLength } from '@/lib/booking/types';
import { cn } from '@/lib/cn';
import { addException, removeException, saveAvailability, type Rule, type Settings } from './actions';

/** Monday first, as in the UAE working week; weekday numbers follow JavaScript (0 = Sunday). */
const weekdays = [1, 2, 3, 4, 5, 6, 0] as const;

const field =
  'min-h-11 rounded-input border border-line-strong bg-surface px-3 text-base text-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring';

export type ExceptionRow = { id: string; kind: 'day_off' | 'extra_slot'; label: string };

export function AvailabilityForm({ rules: initialRules, settings: initialSettings, exceptions }: { rules: Rule[]; settings: Settings; exceptions: ExceptionRow[] }) {
  const t = useTranslations('booking.availability');
  const tv = useTranslations('verify.availability');
  const tp = useTranslations('booking.panel');
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid' | 'error'>('idle');
  const [pending, startTransition] = useTransition();
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['Asia/Dubai'];
    }
  }, []);

  const update = (i: number, patch: Partial<Rule>) => {
    setRules((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setStatus('idle');
  };
  const add = (weekday: number) => {
    const last = rules.filter((r) => r.weekday === weekday).at(-1);
    setRules((list) => [...list, { weekday, start: last ? last.end : '09:00', end: last ? '17:00' : '13:00', minutes: last?.minutes ?? 60, format: last?.format ?? 'video' }]);
  };

  const save = () =>
    startTransition(async () => {
      if (rules.some((r) => r.end <= r.start)) return setStatus('invalid');
      const result = await saveAvailability(rules, settings).catch(() => ({ status: 'error' as const }));
      setStatus(result.status === 'ok' ? 'saved' : result.status);
      if (result.status === 'ok') router.refresh();
    });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-5"
      >
        <section className={cn(cardClasses, 'flex flex-col gap-3 p-[clamp(20px,3vw,32px)]')} aria-labelledby="weekly-title">
          <h2 id="weekly-title" className="text-lg font-extrabold">{t('weekly')}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {weekdays.map((d) => {
              const blocks = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === d);
              return (
                <li key={d} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-bold">{tv(`days.${d}`)}</span>
                    <button type="button" onClick={() => add(d)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-2 text-sm font-bold text-brand-text">
                      <Plus aria-hidden className="size-4" /> {t('addBlock')}
                    </button>
                  </div>
                  {blocks.length === 0 ? <p className="text-sm text-muted">{t('noHours')}</p> : null}
                  {blocks.map(({ r, i }) => (
                    <div key={i} className="flex flex-wrap items-center gap-2" data-testid="availability-block">
                      <div dir="ltr" className="flex items-center gap-2">
                        <input type="time" aria-label={`${tv(`days.${d}`)} ${t('from')}`} value={r.start} onChange={(e) => update(i, { start: e.target.value })} className={field} />
                        <span aria-hidden>–</span>
                        <input type="time" aria-label={`${tv(`days.${d}`)} ${t('to')}`} value={r.end} onChange={(e) => update(i, { end: e.target.value })} className={field} />
                      </div>
                      <select aria-label={`${tv(`days.${d}`)} ${t('length')}`} value={r.minutes} onChange={(e) => update(i, { minutes: Number(e.target.value) as SessionLength })} className={field}>
                        {sessionLengths.map((m) => (
                          <option key={m} value={m}>{tp('minutes', { minutes: m })}</option>
                        ))}
                      </select>
                      <select aria-label={`${tv(`days.${d}`)} ${t('format')}`} value={r.format} onChange={(e) => update(i, { format: e.target.value as SessionFormat })} className={field}>
                        <option value="video">{tp('video')}</option>
                        <option value="in_person">{tp('in_person')}</option>
                      </select>
                      <button type="button" aria-label={`${t('removeBlock')} ${tv(`days.${d}`)} ${r.start}`} onClick={() => setRules((list) => list.filter((_, j) => j !== i))} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center text-danger">
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>

        <section className={cn(cardClasses, 'flex flex-col gap-4 p-[clamp(20px,3vw,32px)]')} aria-labelledby="settings-title">
          <h2 id="settings-title" className="text-lg font-extrabold">{t('settings')}</h2>
          <label className="flex flex-col gap-1 text-[15px] font-bold">
            {t('timeZone')}
            <select value={settings.timeZone} onChange={(e) => setSettings({ ...settings, timeZone: e.target.value })} className={field} aria-describedby="tz-hint">
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <span id="tz-hint" className="text-sm font-normal text-muted">{t('timeZoneHint')}</span>
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-[15px] font-bold">
              {t('buffer')}
              <select value={settings.bufferMinutes} onChange={(e) => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })} className={field}>
                {[0, 5, 10, 15, 20, 30].map((m) => (
                  <option key={m} value={m}>{t('bufferValue', { minutes: m })}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[15px] font-bold">
              {t('maxPerDay')}
              <select value={settings.maxPerDay ?? ''} onChange={(e) => setSettings({ ...settings, maxPerDay: e.target.value ? Number(e.target.value) : null })} className={field}>
                <option value="">{t('noLimit')}</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-[15px]">
            <input type="checkbox" checked={settings.autoAccept} onChange={(e) => setSettings({ ...settings, autoAccept: e.target.checked })} className="mt-1 size-5 accent-ink" />
            <span>
              <span className="font-bold">{t('autoAccept')}</span>
              <span className="block text-sm text-muted">{t('autoAcceptHint')}</span>
            </span>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[15px] font-bold">{t('gender')}</legend>
            <div className="flex flex-wrap gap-4">
              {(['female', 'male'] as const).map((g) => (
                <label key={g} className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
                  <input type="radio" name="gender" checked={settings.gender === g} onChange={() => setSettings({ ...settings, gender: g })} className="size-5 accent-ink" />
                  {t(g === 'female' ? 'genderFemale' : 'genderMale')}
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-[15px]">
              <input type="checkbox" checked={settings.showGender} disabled={!settings.gender} onChange={(e) => setSettings({ ...settings, showGender: e.target.checked })} className="mt-1 size-5 accent-ink" />
              <span>
                <span className="font-bold">{t('showGender')}</span>
                <span className="block text-sm text-muted">{t('showGenderHint')}</span>
              </span>
            </label>
          </fieldset>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'min-w-40 disabled:cursor-wait disabled:opacity-60')}>
            {t('save')}
          </button>
          <p role="status" aria-live="polite" className={cn('text-sm font-semibold', status === 'saved' ? 'text-success-text' : 'text-danger')}>
            {status === 'idle' ? '' : t(status === 'saved' ? 'saved' : status)}
          </p>
        </div>
      </form>

      <Exceptions exceptions={exceptions} timeZone={settings.timeZone} />
    </div>
  );
}

function Exceptions({ exceptions, timeZone }: { exceptions: ExceptionRow[]; timeZone: string }) {
  const t = useTranslations('booking.availability');
  const tp = useTranslations('booking.panel');
  const router = useRouter();
  const [kind, setKind] = useState<'day_off' | 'extra_slot'>('day_off');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('18:00');
  const [minutes, setMinutes] = useState<SessionLength>(60);
  const [format, setFormat] = useState<SessionFormat>('video');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ status: string }>) =>
    startTransition(async () => {
      const result = await fn().catch(() => ({ status: 'error' }));
      setError(result.status !== 'ok');
      if (result.status === 'ok') router.refresh();
    });

  return (
    <section className={cn(cardClasses, 'flex flex-col gap-3 p-[clamp(20px,3vw,32px)]')} aria-labelledby="exceptions-title">
      <h2 id="exceptions-title" className="text-lg font-extrabold">{t('exceptions')}</h2>
      {exceptions.length === 0 ? <p className="text-sm text-muted">{t('exceptionsEmpty')}</p> : null}
      <ul className="flex flex-col gap-2">
        {exceptions.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-[14px]">
            <span>
              <span className="font-bold">{t(x.kind === 'day_off' ? 'dayOff' : 'extraSlot')}</span> · {x.label}
            </span>
            <button type="button" disabled={pending} onClick={() => run(() => removeException(x.id))} className="min-h-11 cursor-pointer px-2 text-sm font-bold text-danger">
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('exceptions')}
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={field}>
            <option value="day_off">{t('dayOff')}</option>
            <option value="extra_slot">{t('extraSlot')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {t('date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} dir="ltr" />
        </label>
        {kind === 'extra_slot' ? (
          <>
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('from')}
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={field} dir="ltr" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('length')}
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value) as SessionLength)} className={field}>
                {sessionLengths.map((m) => (
                  <option key={m} value={m}>{tp('minutes', { minutes: m })}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              {t('format')}
              <select value={format} onChange={(e) => setFormat(e.target.value as SessionFormat)} className={field}>
                <option value="video">{tp('video')}</option>
                <option value="in_person">{tp('in_person')}</option>
              </select>
            </label>
          </>
        ) : null}
        <button
          type="button"
          disabled={!date || pending}
          onClick={() => run(() => addException(kind === 'day_off' ? { kind, date } : { kind, date, start, minutes, format }, timeZone))}
          className={buttonClasses('ghost', 'sm', 'disabled:opacity-50')}
        >
          {t('addException')}
        </button>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{t('error')}</p> : null}
    </section>
  );
}
