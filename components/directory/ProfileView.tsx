'use client';

import { BadgeCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { BookingPanel } from '@/components/booking/BookingPanel';
import { useViewerTimeZone } from '@/components/booking/useViewerTimeZone';
import { useOnlineProfessionals } from '@/components/realtime/presence';
import { Link } from '@/i18n/navigation';
import { dayLabel, groupByDay, timeLabel, zoneLabel } from '@/lib/booking/time';
import type { Slot } from '@/lib/booking/types';
import type { DirectoryEntry } from '@/lib/directory/sort';
import { Avatar } from './DirectoryList';

/**
 * A professional's profile (task 15, section 2): bio, credentials (the
 * verified authority and status only, never the licence number),
 * specialties, languages and the next two weeks of free times.
 */
export function ProfileView({ entry, slots }: { entry: DirectoryEntry; slots: Slot[] }) {
  const t = useTranslations('directory');
  const tl = useTranslations('proOnboarding.labels');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const online = useOnlineProfessionals();
  const langName = useMemo(() => {
    const dn = new Intl.DisplayNames(locale, { type: 'language' });
    return (code: string) => dn.of(code) ?? code;
  }, [locale]);
  const days = groupByDay(slots, zone);
  const authority = entry.licenceAuthority ? tl(`authority.${entry.licenceAuthority}` as 'authority.other') : '';

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pb-10 pt-7 sm:pt-9">
      <Link href="/dashboard/counsellor" className="text-[13px] font-bold text-[#C2410C] underline">
        {t('profilePage.back')}
      </Link>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <header className="flex flex-wrap items-center gap-4">
            <Avatar entry={entry} index={0} size="lg" />
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.01em] text-ink">{entry.displayName}</h1>
              <p className="text-[15px] text-neutral-600">
                {entry.profession ? tl(`profession.${entry.profession}` as 'profession.other') : ''}
                {entry.yearsExperience ? ` · ${t('experience', { years: entry.yearsExperience })}` : ''}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-3 text-[13px]">
                <span className="inline-flex items-center gap-1 font-bold text-[#166534]">
                  <BadgeCheck aria-hidden className="size-4" /> {t('verified', { authority })}
                </span>
                {online.has(entry.userId) ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#166534]">
                    <span aria-hidden className="size-2 rounded-full bg-[#15803D]" /> {t('online')}
                  </span>
                ) : null}
              </p>
            </div>
          </header>

          {entry.bio ? (
            <section className="rounded-2xl bg-white p-6 shadow-card">
              <h2 className="text-[16px] font-extrabold">{t('profilePage.about')}</h2>
              <p className="mt-2 text-[14px] leading-6 text-neutral-800" dir="auto">{entry.bio}</p>
              {entry.facilityName ? <p className="mt-2 text-[13px] text-neutral-600">{t('profilePage.facility')}: <span dir="auto">{entry.facilityName}</span></p> : null}
            </section>
          ) : null}

          <section className="rounded-2xl bg-white p-6 shadow-card">
            <h2 className="text-[16px] font-extrabold">{t('profilePage.credentials')}</h2>
            <p className="mt-2 text-[14px] text-neutral-800">{t('profilePage.credentialsBody', { authority })}</p>
            <h3 className="mt-4 text-[14px] font-bold">{t('profilePage.specialties')}</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {entry.specialties.map((s) => (
                <li key={s} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[12px] font-medium text-neutral-700">{tl(`specialty.${s}` as 'specialty.metabolic')}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-[14px] font-bold">{t('profilePage.languages')}</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {entry.languages.map((l) => (
                <li key={l} className="rounded-full bg-[#FFEDE2] px-2.5 py-0.5 text-[12px] font-medium text-[#9A3412]">{langName(l)}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-card" aria-labelledby="availability-title">
            <h2 id="availability-title" className="text-[16px] font-extrabold">{t('profilePage.availability')}</h2>
            <p className="mt-1 text-[13px] text-neutral-600">{t('profilePage.availabilityHint')}</p>
            {days.length === 0 ? (
              <p className="mt-3 text-[14px] text-neutral-700">{t('profilePage.noAvailability')}</p>
            ) : (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {days.map((d) => (
                  <div key={d.day} className="rounded-xl border border-neutral-200 p-3">
                    <dt className="text-[13px] font-bold">{dayLabel(d.slots[0].startsAt, zone, locale)}</dt>
                    <dd className="mt-1 text-[13px] text-neutral-700" dir="ltr">
                      {d.slots.map((s) => timeLabel(s.startsAt, zone, locale)).join(' · ')}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {days.length ? <p className="mt-2 text-[12px] text-neutral-500">{zoneLabel(days[0].slots[0].startsAt, zone, locale)}</p> : null}
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <Link href={`/dashboard/messages?with=${entry.userId}`} className="inline-flex min-h-12 items-center justify-center rounded-full border border-neutral-300 bg-white px-5 text-[14px] font-bold text-ink no-underline hover:bg-brand/5">
            {t('messageAria', { name: entry.displayName })}
          </Link>
          <BookingPanel professional={{ userId: entry.userId, displayName: entry.displayName }} initialSlots={slots} />
        </div>
      </div>
    </div>
  );
}
