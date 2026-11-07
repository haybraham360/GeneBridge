import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../components/PageHeader';
import { AvailabilityForm } from './AvailabilityForm';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/availability'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'verify.availability' });
  return { title: t('title'), robots: { index: false } };
}

/** Weekly hours (task 14 section 4, booking in task 15). Saved now; patients see them only once verified. */
export default async function AvailabilityPage({ params }: PageProps<'/[locale]/pro/availability'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId, verified }, t] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'verify.availability' }),
  ]);
  const { data } = await supabase
    .from('professional_availability')
    .select('weekday, starts_at, ends_at')
    .eq('user_id', userId)
    .order('weekday')
    .order('starts_at');
  const slots = ((data ?? []) as { weekday: number; starts_at: string; ends_at: string }[]).map((r) => ({
    weekday: r.weekday,
    startsAt: r.starts_at.slice(0, 5),
    endsAt: r.ends_at.slice(0, 5),
  }));

  return (
    <>
      <PageHeader title={t('title')} subtitle={verified ? t('subtitleVerified') : t('subtitle')} />
      <AvailabilityForm initial={slots} />
    </>
  );
}
