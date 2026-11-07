'use client';

import { BadgeCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useOnlineProfessionals } from '@/components/realtime/presence';
import { useViewerTimeZone } from '@/components/booking/useViewerTimeZone';
import { Link } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import { filterDirectory, initialsOf, type DirectoryEntry, type DirectoryFilters } from '@/lib/directory/sort';
import { professions, specialties } from '@/lib/kyc/types';
import { cn } from '@/lib/cn';

const AVATARS = ['bg-ink text-white', 'bg-[#FFE2D2] text-[#9A3412]', 'bg-[#E5ECF6] text-[#1E3A8A]'];

export function Avatar({ entry, index, size = 'md' }: { entry: Pick<DirectoryEntry, 'displayName' | 'photoUrl'>; index: number; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 text-[24px]' : 'h-14 w-14 text-[18px]';
  if (entry.photoUrl) {
    // Signed, short-lived private link (lib/directory/server.ts).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.photoUrl} alt="" className={cn('shrink-0 rounded-full object-cover', box)} />;
  }
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full font-bold', box, AVATARS[index % AVATARS.length])}>
      {initialsOf(entry.displayName)}
    </span>
  );
}

/**
 * "Choose a professional" (design: Counsellor): only verified professionals
 * accepting patients, already in the patient's order (language, then
 * specialty match, then soonest). Filters run in the browser.
 */
export function DirectoryList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: DirectoryEntry[];
  selectedId: string | null;
  onSelect: (entry: DirectoryEntry) => void;
}) {
  const t = useTranslations('directory');
  const tl = useTranslations('proOnboarding.labels');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const online = useOnlineProfessionals();
  const [filters, setFilters] = useState<DirectoryFilters>({});
  const shown = useMemo(() => filterDirectory(entries, filters), [entries, filters]);

  const langName = useMemo(() => {
    const dn = new Intl.DisplayNames(locale, { type: 'language' });
    return (code: string) => dn.of(code) ?? code;
  }, [locale]);
  const languages = useMemo(() => [...new Set(entries.flatMap((e) => e.languages))].sort(), [entries]);
  const set = (patch: DirectoryFilters) => setFilters((f) => ({ ...f, ...patch }));
  const active = Object.values(filters).some(Boolean);

  if (entries.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-5 text-[14px] text-neutral-700 shadow-card" data-testid="directory-empty">
        {t('empty')}
      </p>
    );
  }

  const select = 'min-h-11 rounded-input border border-neutral-300 bg-white px-3 text-[13px] text-ink';

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap items-center gap-2.5" aria-label={t('filters.label')}>
        <legend className="sr-only">{t('filters.label')}</legend>
        <select aria-label={t('filters.language')} value={filters.language ?? ''} onChange={(e) => set({ language: e.target.value || null })} className={select}>
          <option value="">{t('filters.anyLanguage')}</option>
          {languages.map((l) => (
            <option key={l} value={l}>{langName(l)}</option>
          ))}
        </select>
        <select aria-label={t('filters.profession')} value={filters.profession ?? ''} onChange={(e) => set({ profession: e.target.value || null })} className={select}>
          <option value="">{t('filters.anyProfession')}</option>
          {professions.map((p) => (
            <option key={p} value={p}>{tl(`profession.${p}`)}</option>
          ))}
        </select>
        <select aria-label={t('filters.specialty')} value={filters.specialty ?? ''} onChange={(e) => set({ specialty: e.target.value || null })} className={select}>
          <option value="">{t('filters.anySpecialty')}</option>
          {specialties.map((s) => (
            <option key={s} value={s}>{tl(`specialty.${s}`)}</option>
          ))}
        </select>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-semibold">
          <input type="checkbox" checked={Boolean(filters.thisWeek)} onChange={(e) => set({ thisWeek: e.target.checked })} className="size-4 accent-ink" />
          {t('filters.thisWeek')}
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-semibold" title={t('filters.womenOnlyHint')}>
          <input type="checkbox" checked={Boolean(filters.womenOnly)} onChange={(e) => set({ womenOnly: e.target.checked })} className="size-4 accent-ink" aria-describedby="women-only-hint" />
          {t('filters.womenOnly')}
        </label>
        <span id="women-only-hint" className="sr-only">{t('filters.womenOnlyHint')}</span>
        {active ? (
          <button type="button" onClick={() => setFilters({})} className="min-h-11 cursor-pointer px-2 text-[13px] font-bold text-[#C2410C] underline">
            {t('filters.clear')}
          </button>
        ) : null}
      </fieldset>
      <p role="status" aria-live="polite" className="sr-only">{t('filters.showing', { count: shown.length })}</p>

      {shown.length === 0 ? <p className="text-[14px] text-neutral-700">{t('emptyFiltered')}</p> : null}

      <ul className="flex flex-col gap-4" data-testid="directory">
        {shown.map((e, i) => {
          const selected = e.userId === selectedId;
          return (
            <li
              key={e.userId}
              data-testid="directory-card"
              data-professional={e.userId}
              className={cn(
                'flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-card',
                selected ? 'border border-brand ring-1 ring-brand' : 'border border-transparent',
              )}
            >
              <span className="relative">
                <Avatar entry={e} index={i} />
                {online.has(e.userId) ? (
                  <span className="absolute end-0 bottom-0 size-3.5 rounded-full border-2 border-white bg-[#15803D]" title={t('online')} />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-extrabold leading-5 text-ink">{e.displayName}</h3>
                <p className="mt-0.5 text-[13px] leading-4.5 text-neutral-500">
                  {e.profession ? tl(`profession.${e.profession}` as 'profession.other') : ''}
                  {' · '}
                  {e.nextSlot ? t('next', { when: whenLabel(e.nextSlot, zone, locale) }) : t('noSlots')}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className="inline-flex items-center gap-1 font-bold text-[#166534]" data-testid="verified-badge">
                    <BadgeCheck aria-hidden className="size-3.5" />
                    {t('verified', { authority: e.licenceAuthority ? tl(`authority.${e.licenceAuthority}` as 'authority.other') : '' })}
                  </span>
                  {online.has(e.userId) ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-[#166534]">
                      <span aria-hidden className="size-2 rounded-full bg-[#15803D]" />
                      {t('online')}
                    </span>
                  ) : null}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('profilePage.languages')}>
                  {e.languages.map((l) => (
                    <li key={l} className="rounded-full bg-[#FFEDE2] px-2.5 py-0.5 text-[11px] font-medium text-[#9A3412]">{langName(l)}</li>
                  ))}
                </ul>
                {e.specialties.length ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t('profilePage.specialties')}>
                    {e.specialties.slice(0, 4).map((s) => (
                      <li key={s} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700">
                        {tl(`specialty.${s}` as 'specialty.metabolic')}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/messages?with=${e.userId}`}
                  aria-label={t('messageAria', { name: e.displayName })}
                  className="inline-flex h-10 items-center rounded-full border border-neutral-300 bg-white px-4 text-[13px] font-bold text-ink no-underline hover:bg-brand/5"
                >
                  {t('message')}
                </Link>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={t('bookAria', { name: e.displayName })}
                  onClick={() => onSelect(e)}
                  className={cn('h-10 cursor-pointer rounded-full px-4 text-[13px] font-bold', selected ? 'bg-ink text-white' : 'border border-neutral-300 bg-white text-ink hover:bg-brand/5')}
                >
                  {selected ? t('selected') : t('book')}
                </button>
                <Link href={`/dashboard/counsellor/${e.userId}`} aria-label={t('profileAria', { name: e.displayName })} className="inline-flex h-10 items-center px-2 text-[13px] font-bold text-[#C2410C] underline">
                  {t('profile')}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
