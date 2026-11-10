'use client';

import { EyeOff, MapPin, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { findArea } from '@/config/uae-areas';
import { cn } from '@/lib/cn';
import type { Place } from '@/lib/nearby/places';
import { addLocation, findAddress, removeLocation, updateLocation, type LocationInput } from './locationActions';

export type PracticeLocation = {
  id: string;
  label: string;
  addressEn: string | null;
  addressAr: string | null;
  areaId: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  showOnMap: boolean;
};

const blank: LocationInput = { label: '', addressEn: '', addressAr: '', point: '', countryCode: null, showOnMap: true };

/** Where the professional sees patients in person, anywhere in the world (docs/nearby-care.md). Up to 5. */
export function PracticeLocations({ locations, visible }: { locations: PracticeLocation[]; visible: boolean }) {
  const t = useTranslations('verify.settings.locations');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<LocationInput>(blank);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'idle' | 'searching' | 'error'>('idle');
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid' | 'tooMany' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  const where = (loc: PracticeLocation) => {
    const address = locale === 'ar' ? (loc.addressAr ?? loc.addressEn) : (loc.addressEn ?? loc.addressAr);
    const area = findArea(loc.areaId)?.name[locale];
    const country = loc.countryCode ? regions.of(loc.countryCode) : null;
    return [address ?? area, country].filter(Boolean).join(' · ');
  };

  const open = (loc: PracticeLocation | null) => {
    setStatus('idle');
    setFound(null);
    setQuery('');
    setFinding('idle');
    setEditing(loc ? loc.id : 'new');
    setForm(
      loc
        ? { label: loc.label, addressEn: loc.addressEn ?? '', addressAr: loc.addressAr ?? '', point: `${loc.lat}, ${loc.lng}`, countryCode: loc.countryCode, showOnMap: loc.showOnMap }
        : blank,
    );
  };
  const done = (r: { status: string }) => {
    const s = r.status === 'ok' ? 'saved' : r.status === 'too_many' ? 'tooMany' : r.status === 'invalid' ? 'invalid' : 'error';
    setStatus(s);
    if (s === 'saved') setEditing(null);
  };
  const save = () =>
    startTransition(async () => {
      const r = await (editing === 'new' ? addLocation(form) : updateLocation(editing as string, form)).catch(() => ({ status: 'error' }));
      done(r);
    });
  const remove = (id: string) =>
    startTransition(async () => {
      done(await removeLocation(id).catch(() => ({ status: 'error' })));
    });
  const search = () => {
    if (query.trim().length < 2) return;
    setFinding('searching');
    startTransition(async () => {
      const r = await findAddress(query, locale).catch(() => ({ status: 'error' as const }));
      if (r.status === 'ok') {
        setFound(r.places);
        setFinding('idle');
      } else setFinding('error');
    });
  };
  const choose = (p: Place) => {
    setForm((f) => ({
      ...f,
      point: `${p.point.lat}, ${p.point.lng}`,
      countryCode: p.countryCode,
      // Fill the address in the page's language if it's still empty.
      ...(locale === 'ar' ? (f.addressAr ? {} : { addressAr: p.label }) : f.addressEn ? {} : { addressEn: p.label }),
    }));
    setFound(null);
  };

  const field = 'min-h-12 w-full rounded-input border border-line-strong bg-surface px-4 text-base font-normal';

  return (
    <section aria-labelledby="practice-locations" className={cn(cardClasses, 'flex max-w-2xl flex-col gap-4 p-[clamp(20px,3vw,32px)]')} data-testid="practice-locations">
      <div className="flex flex-col gap-1">
        <h2 id="practice-locations" className="text-lg font-extrabold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('body')}</p>
        {!visible ? <p className="text-sm font-semibold">{t('lockedNote')}</p> : null}
      </div>

      {locations.length === 0 && editing === null ? <p className="text-[15px]">{t('empty')}</p> : null}

      <ul className="flex flex-col gap-3">
        {locations.map((loc) => (
          <li key={loc.id} className="flex flex-wrap items-start justify-between gap-3 rounded-input border border-line p-4">
            <div className="flex min-w-0 items-start gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" strokeWidth={2} />
              <div className="min-w-0">
                <p className="font-bold">{loc.label}</p>
                <p className="text-sm text-muted">{where(loc)}</p>
                {!loc.showOnMap ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-muted">
                    <EyeOff aria-hidden="true" className="size-3.5" />
                    {t('hidden')}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => open(loc)} aria-label={t('editAria', { label: loc.label })} className={buttonClasses('ghost', 'sm')}>
                {t('edit')}
              </button>
              <button type="button" disabled={pending} onClick={() => remove(loc.id)} aria-label={t('removeAria', { label: loc.label })} className={buttonClasses('ghost', 'sm', 'text-danger')}>
                {t('remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== null ? (
        <div className="flex flex-col gap-4 rounded-input border border-line p-4">
          <label className="flex flex-col gap-1.5 text-[15px] font-bold">
            {t('label')}
            <input required maxLength={120} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={field} />
          </label>

          {/* Find the address: a separate form, so Enter searches instead of saving. */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
            className="flex flex-col gap-1.5"
          >
            <label htmlFor="location-find" className="text-[15px] font-bold">
              {t('find')}
            </label>
            <div className="flex flex-wrap gap-2">
              <input id="location-find" type="search" maxLength={120} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('findPlaceholder')} className={cn(field, 'min-w-[220px] flex-1')} />
              <button type="submit" disabled={query.trim().length < 2 || finding === 'searching'} className={buttonClasses('dark', 'md', 'disabled:cursor-not-allowed disabled:opacity-60')}>
                <Search aria-hidden="true" className="size-5" strokeWidth={2} />
                {t('findButton')}
              </button>
            </div>
            <p role="status" aria-live="polite" className="text-sm font-semibold">
              {finding === 'searching' ? t('finding') : finding === 'error' ? t('findError') : found && found.length === 0 ? t('findNone') : ''}
            </p>
            {found && found.length ? (
              <ul aria-label={t('findResults')} className="flex flex-col gap-2">
                {found.map((p) => (
                  <li key={p.label}>
                    <button type="button" onClick={() => choose(p)} className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-input border border-line-strong bg-surface px-4 py-2 text-start text-[15px] hover:bg-brand-tint-soft">
                      <MapPin aria-hidden="true" className="size-4 flex-none text-muted" strokeWidth={2} />
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="location-point" className="text-[15px] font-bold">
                {t('point')}
              </label>
              <input
                id="location-point"
                required
                dir="ltr"
                inputMode="decimal"
                maxLength={60}
                value={form.point}
                onChange={(e) => setForm({ ...form, point: e.target.value, countryCode: null })}
                aria-describedby="location-point-help"
                className={field}
              />
              <p id="location-point-help" className="text-sm text-muted">
                {t('pointHelp')}
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-[15px] font-bold">
              {t('addressEn')}
              <input dir="ltr" lang="en" maxLength={240} value={form.addressEn} onChange={(e) => setForm({ ...form, addressEn: e.target.value })} className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-[15px] font-bold">
              {t('addressAr')}
              <input dir="rtl" lang="ar" maxLength={240} value={form.addressAr} onChange={(e) => setForm({ ...form, addressAr: e.target.value })} className={field} />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
              <input type="checkbox" checked={form.showOnMap} onChange={(e) => setForm({ ...form, showOnMap: e.target.checked })} className="size-5 cursor-pointer accent-ink" />
              {t('showOnMap')}
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={pending || !form.label.trim()} className={buttonClasses('primary', 'md', 'disabled:cursor-wait disabled:opacity-60')}>
                {t('save')}
              </button>
              <button type="button" onClick={() => setEditing(null)} className={buttonClasses('ghost', 'md')}>
                {t('cancel')}
              </button>
            </div>
          </form>
        </div>
      ) : locations.length < 5 ? (
        <button type="button" onClick={() => open(null)} className={buttonClasses('ghost', 'md', 'self-start')}>
          {t('add')}
        </button>
      ) : null}

      <p role="status" aria-live="polite" className={cn('text-sm font-semibold', status === 'saved' ? 'text-success-text' : 'text-danger')}>
        {status === 'idle' ? '' : t(status)}
      </p>
    </section>
  );
}
