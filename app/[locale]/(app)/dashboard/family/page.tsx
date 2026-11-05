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

export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/family'>) {
  const { locale } = await params;
  const { notify } = await searchParams;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Notices are sent server-side (task 08); the map itself stays in the browser.
  // ?notify=1 opens the notify flow directly (from the talk page's relatives guide).
  return <FamilyMap lang={locale} onNotify={sendFamilyNotices} openNotify={notify === '1'} />;
}
