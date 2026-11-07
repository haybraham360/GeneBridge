import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LiveRefresh } from '@/components/realtime/LiveRefresh';
import { routing } from '@/i18n/routing';
import { loadProBookingContext } from '@/lib/booking/pro';
import { loadProBookings } from '@/lib/booking/server';
import { dayKey, dayLabel, timeLabel, zoneLabel } from '@/lib/booking/time';
import { isLive } from '@/lib/booking/types';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../../components/PageHeader';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/calendar'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'booking.pro' });
  return { title: t('calendarTitle'), robots: { index: false } };
}

/** Calendar view (task 15, section 4): the next 14 days, one row per day. */
export default async function CalendarPage({ params }: PageProps<'/[locale]/pro/calendar'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId }, t, tm, tp] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'booking.pro' }),
    getTranslations({ locale, namespace: 'booking.mine' }),
    getTranslations({ locale, namespace: 'booking.panel' }),
  ]);
  const { timeZone } = await loadProBookingContext(supabase, userId);
  const now = new Date();
  const bookings = (await loadProBookings(supabase, now, new Date(now.getTime() + 14 * 86_400_000))).filter((b) => isLive(b.status));
  const days = Array.from({ length: 14 }, (_, i) => new Date(now.getTime() + i * 86_400_000).toISOString());

  return (
    <>
      <LiveRefresh channel={`pro-calendar-${userId}`} watch={[{ table: 'bookings', filter: `professional_id=eq.${userId}` }]} />
      <PageHeader title={t('calendarTitle')} subtitle={t('calendarSubtitle', { zone: zoneLabel(now.toISOString(), timeZone, locale) })} />
      <ol className="flex flex-col gap-2" data-testid="pro-calendar">
        {days.map((iso) => {
          const key = dayKey(iso, timeZone);
          const items = bookings.filter((b) => dayKey(b.startsAt, timeZone) === key);
          return (
            <li key={key} className="flex flex-wrap gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
              <span className="w-28 shrink-0 text-[15px] font-extrabold">{dayLabel(iso, timeZone, locale)}</span>
              {items.length === 0 ? (
                <span className="text-sm text-muted">{t('calendarEmpty')}</span>
              ) : (
                <ul className="flex flex-1 flex-wrap gap-2">
                  {items.map((b) => (
                    <li key={b.id} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${b.status === 'requested' ? 'bg-brand-tint-soft text-brand-text-dark' : 'bg-success-tint text-success-text'}`}>
                      <span dir="ltr">{timeLabel(b.startsAt, timeZone, locale)}</span> · {b.patientName} · {tp(b.format)} · {tm(`status.${b.status}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
