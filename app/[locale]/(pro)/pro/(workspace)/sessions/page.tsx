import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ProBookingCard } from '@/components/booking/ProBookingCard';
import { LiveRefresh } from '@/components/realtime/LiveRefresh';
import { routing } from '@/i18n/routing';
import { loadProBookingContext } from '@/lib/booking/pro';
import { loadProBookings } from '@/lib/booking/server';
import { dayKey, zoneLabel } from '@/lib/booking/time';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../../components/PageHeader';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/sessions'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro' });
  return { title: `${t('sessions.title')} · ${t('meta.title')}`, robots: { index: false } };
}

/**
 * Sessions (task 15, section 4): requests waiting for a response, today's
 * sessions and the next two weeks, in the professional's time zone. Live:
 * a patient's booking appears here as soon as it's made.
 */
export default async function SessionsPage({ params }: PageProps<'/[locale]/pro/sessions'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId }, t] = await Promise.all([requireProfessionalPage(), getTranslations({ locale, namespace: 'booking.pro' })]);
  const ctx = await loadProBookingContext(supabase, userId);
  const now = new Date();
  const bookings = await loadProBookings(supabase, new Date(now.getTime() - 12 * 3600_000), new Date(now.getTime() + 14 * 86_400_000));
  const today = dayKey(now.toISOString(), ctx.timeZone);

  const waiting = bookings.filter((b) => b.status === 'requested');
  const todays = bookings.filter((b) => b.status !== 'requested' && dayKey(b.startsAt, ctx.timeZone) === today && b.status !== 'cancelled' && b.status !== 'declined');
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && dayKey(b.startsAt, ctx.timeZone) > today);

  const list = (items: typeof bookings, empty: string, testId: string, showDay = false) =>
    items.length === 0 ? (
      <p className="rounded-card border border-line bg-surface p-6 text-muted shadow-card">{empty}</p>
    ) : (
      <ol className="flex flex-col gap-3" data-testid={testId}>
        {items.map((b) => (
          <ProBookingCard key={b.id} booking={b} timeZone={ctx.timeZone} showDay={showDay} googleConnected={ctx.googleConnected} />
        ))}
      </ol>
    );

  return (
    <>
      <LiveRefresh channel={`pro-bookings-${userId}`} watch={[{ table: 'bookings', filter: `professional_id=eq.${userId}` }]} />
      <PageHeader title={t('sessionsTitle')} subtitle={t('sessionsSubtitle', { zone: zoneLabel(now.toISOString(), ctx.timeZone, locale) })} />
      <section className="flex flex-col gap-3" aria-labelledby="waiting">
        <h2 id="waiting" className="text-lg font-extrabold">{t('waiting')}</h2>
        {list(waiting, t('waitingEmpty'), 'waiting-bookings', true)}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="today">
        <h2 id="today" className="text-lg font-extrabold">{t('today')}</h2>
        {list(todays, t('todayEmpty'), 'todays-sessions')}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="upcoming">
        <h2 id="upcoming" className="text-lg font-extrabold">{t('upcoming')}</h2>
        {list(upcoming, t('upcomingEmpty'), 'upcoming-sessions', true)}
      </section>
    </>
  );
}
