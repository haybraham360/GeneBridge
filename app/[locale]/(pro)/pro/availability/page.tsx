import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cardClasses } from '@/components/ui/Card';
import { routing } from '@/i18n/routing';
import { loadSlots } from '@/lib/booking/server';
import { dayLabel, timeLabel, viewerTimeZone, whenLabel, zoneLabel } from '@/lib/booking/time';
import type { SessionFormat, SessionLength } from '@/lib/booking/types';
import { cn } from '@/lib/cn';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../components/PageHeader';
import type { Rule, Settings } from './actions';
import { AvailabilityForm, type ExceptionRow } from './AvailabilityForm';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/availability'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'booking.availability' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * Availability (task 15, section 4): weekly hours in the professional's own
 * time zone, days off and extra times, booking settings, and a preview of
 * the next free times patients see (once verified and accepting patients).
 */
export default async function AvailabilityPage({ params }: PageProps<'/[locale]/pro/availability'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId, verified, profile }, t] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'booking.availability' }),
  ]);
  const now = new Date();
  const [{ data: ruleRows }, { data: proRow }, { data: exceptionRows }] = await Promise.all([
    supabase.from('availability_rules').select('weekday, start_time, end_time, session_minutes, format').eq('user_id', userId).order('weekday').order('start_time'),
    supabase.from('professional_profiles').select('time_zone, buffer_minutes, max_sessions_per_day, auto_accept_bookings, gender, show_gender').eq('user_id', userId).maybeSingle(),
    supabase.from('availability_exceptions').select('id, kind, starts_at, ends_at').eq('user_id', userId).gte('ends_at', now.toISOString()).order('starts_at'),
  ]);

  const rules: Rule[] = ((ruleRows ?? []) as { weekday: number; start_time: string; end_time: string; session_minutes: SessionLength; format: SessionFormat }[]).map((r) => ({
    weekday: r.weekday,
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    minutes: r.session_minutes,
    format: r.format,
  }));
  const settings: Settings = {
    timeZone: viewerTimeZone(proRow?.time_zone),
    bufferMinutes: proRow?.buffer_minutes ?? 10,
    maxPerDay: proRow?.max_sessions_per_day ?? null,
    autoAccept: Boolean(proRow?.auto_accept_bookings),
    showGender: Boolean(proRow?.show_gender),
    gender: proRow?.gender ?? null,
  };
  const zone = settings.timeZone;
  const exceptions: ExceptionRow[] = ((exceptionRows ?? []) as { id: string; kind: ExceptionRow['kind']; starts_at: string; ends_at: string }[]).map((x) => ({
    id: x.id,
    kind: x.kind,
    label: x.kind === 'day_off' ? dayLabel(x.starts_at, zone, locale) : whenLabel(x.starts_at, zone, locale),
  }));

  const bookable = verified && profile.acceptingPatients;
  const preview = verified ? (await loadSlots(supabase, userId, now, new Date(now.getTime() + 7 * 86_400_000))).slice(0, 8) : [];

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <AvailabilityForm rules={rules} settings={settings} exceptions={exceptions} />
      <section className={cn(cardClasses, 'flex max-w-3xl flex-col gap-2 p-[clamp(20px,3vw,32px)]')} aria-labelledby="preview-title" data-testid="availability-preview">
        <h2 id="preview-title" className="text-lg font-extrabold">{t('preview')}</h2>
        {!bookable ? <p className="text-sm text-muted">{t('previewLocked')}</p> : null}
        {verified && preview.length === 0 ? <p className="text-sm text-muted">{t('previewEmpty')}</p> : null}
        {preview.length ? (
          <ul className="flex flex-wrap gap-2">
            {preview.map((s) => (
              <li key={s.startsAt} className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold">
                {dayLabel(s.startsAt, zone, locale)} <span dir="ltr">{timeLabel(s.startsAt, zone, locale)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {preview.length ? <p className="text-[12px] text-muted">{zoneLabel(preview[0].startsAt, zone, locale)}</p> : null}
      </section>
    </>
  );
}
