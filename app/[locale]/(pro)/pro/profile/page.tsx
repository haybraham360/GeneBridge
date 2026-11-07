import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { PHOTO_BUCKET } from '@/lib/kyc/storage';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../components/PageHeader';
import { ProfileForm } from './ProfileForm';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/profile'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'verify.profile' });
  return { title: t('title'), robots: { index: false } };
}

/** Profile (task 14): usable before verification; patients see it only once verified (task 15). */
export default async function ProfilePage({ params }: PageProps<'/[locale]/pro/profile'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, profile, verified }, t] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'verify.profile' }),
  ]);

  let photoUrl: string | null = null;
  if (profile.photoPath) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(profile.photoPath, 300);
    photoUrl = data?.signedUrl ?? null;
  }

  return (
    <>
      <PageHeader title={t('title')} subtitle={verified ? t('subtitleVerified') : t('subtitle')} />
      <ProfileForm
        userId={profile.userId}
        initialPhotoUrl={photoUrl}
        initialPhotoPath={profile.photoPath}
        initial={{
          displayName: profile.displayName,
          profession: profile.profession ?? '',
          specialties: profile.specialties,
          languages: profile.languages,
          yearsExperience: profile.yearsExperience === null ? '' : String(profile.yearsExperience),
          facilityName: profile.facilityName ?? '',
          bio: profile.bio ?? '',
        }}
      />
    </>
  );
}
