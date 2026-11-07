import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ProfileView } from '@/components/directory/ProfileView';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { loadSlots } from '@/lib/booking/server';
import { loadDirectory } from '@/lib/directory/server';
import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/counsellor/[id]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'directory' });
  return { title: t('profilePage.credentials'), robots: { index: false } };
}

/** A professional's profile. Only verified professionals accepting patients (the directory decides). */
export default async function ProfessionalPage({ params }: PageProps<'/[locale]/dashboard/counsellor/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const supabase = await createClient();
  const path = await loadUserPath(supabase);
  const entry = UUID.test(id) ? (await loadDirectory(supabase, { language: locale, path })).find((e) => e.userId === id) : undefined;

  if (!entry) {
    const t = await getTranslations({ locale, namespace: 'directory.profilePage' });
    return (
      <div className="px-[clamp(16px,3vw,40px)] pt-9">
        <h1 className="text-[28px] font-extrabold">{t('notFound')}</h1>
        <p className="mt-2 text-[15px] text-neutral-600">{t('notFoundBody')}</p>
        <Link href="/dashboard/counsellor" className="mt-4 inline-block font-bold text-[#C2410C] underline">{t('choose')}</Link>
      </div>
    );
  }
  const now = new Date();
  const slots = await loadSlots(supabase, entry.userId, now, new Date(now.getTime() + 14 * 86_400_000));
  return <ProfileView entry={entry} slots={slots} />;
}
