import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { AcceptingToggle } from '../components/AcceptingToggle';
import { PageHeader } from '../components/PageHeader';
import { SettingsForm } from './SettingsForm';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/settings'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'verify.settings' });
  return { title: t('title'), robots: { index: false } };
}

export default async function SettingsPage({ params }: PageProps<'/[locale]/pro/settings'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId, profile, verified }, t, tl] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'verify.settings' }),
    getTranslations({ locale, namespace: 'proOnboarding.labels' }),
  ]);
  const { data } = await supabase.from('profiles').select('locale').eq('user_id', userId).maybeSingle();

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {verified ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">{t('patients')}</h2>
          <AcceptingToggle initial={profile.acceptingPatients} />
        </section>
      ) : null}
      {profile.licenceNumber ? (
        <section className="flex flex-col gap-1 text-[15px]">
          <h2 className="text-lg font-extrabold">{t('licence')}</h2>
          <p>
            {/* Licence numbers stay left to right in every language. */}
            <bdi dir="ltr">{profile.licenceNumber}</bdi>
            {profile.licenceAuthority ? ` · ${tl(`authority.${profile.licenceAuthority}`)}` : ''}
          </p>
          {profile.licenceExpiry ? <p className="text-muted">{t('expires', { date: new Date(profile.licenceExpiry) })}</p> : null}
        </section>
      ) : null}
      <SettingsForm language={data?.locale === 'en' ? 'en' : 'ar'} notifyEmail={profile.notifyEmail} />
    </>
  );
}
