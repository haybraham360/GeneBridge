import { Video } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { requireCounsellorPage } from '@/lib/pro/server';
import { MarkDoneButton } from './MarkDoneButton';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/video/[id]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro' });
  return { title: `${t('video.title')} · ${t('meta.title')}`, robots: { index: false } };
}

/**
 * MOCK video room (bookings.meeting_url points here in the demo). Shows only
 * for the counsellor who owns the booking (RLS on bookings).
 */
export default async function VideoPage({ params }: PageProps<'/[locale]/pro/video/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, t] = await Promise.all([requireCounsellorPage(), getTranslations({ locale, namespace: 'pro.video' })]);
  const { data: booking } = await supabase
    .from('bookings')
    .select('request_id, attended_at')
    .eq('id', id)
    .maybeSingle();
  if (!booking) notFound();

  return (
    <section className="flex max-w-2xl flex-col gap-5 rounded-card border border-line bg-surface p-8 shadow-card">
      <div className="flex aspect-video items-center justify-center rounded-tile bg-ink text-white">
        <Video aria-hidden="true" className="size-12" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-muted">{t('body')}</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <MarkDoneButton requestId={booking.request_id as string} done={Boolean(booking.attended_at)} />
        <Link href={`/pro?request=${booking.request_id}`} className={buttonClasses('ghost', 'sm')}>
          {t('back')}
        </Link>
      </div>
    </section>
  );
}
