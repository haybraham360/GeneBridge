import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import FamilyMap from '@/components/family/FamilyMap';
import { sendFamilyNotices } from './actions';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/family'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'family') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard/family'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Notices are sent server-side (task 08); the map itself stays in the browser.
  return <FamilyMap lang={locale} onNotify={sendFamilyNotices} />;
}
