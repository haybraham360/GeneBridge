import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import CoupleView from '@/components/couple/CoupleView';
import { currentPerson } from '@/lib/profile/currentPerson';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/couple'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'couple') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard/couple'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const supabase = await createClient();
  const [person, { data: couple }, t] = await Promise.all([
    currentPerson(supabase),
    // The partner's first name, only once both partners agreed to the couple view.
    supabase.rpc('assistant_couple_summary'),
    getTranslations({ locale, namespace: 'dashboard.couple' }),
  ]);
  const row = (couple as { available: boolean; partner_name: string | null }[] | null)?.[0];
  const partnerName = row?.available && row.partner_name ? row.partner_name.trim().split(/\s+/u)[0] : null;

  return (
    <CoupleView
      partners={[
        { id: 'me', name: person.firstName ?? t('you'), sharing: true },
        { id: 'partner', name: partnerName ?? t('yourPartner'), sharing: true },
      ]}
    />
  );
}
