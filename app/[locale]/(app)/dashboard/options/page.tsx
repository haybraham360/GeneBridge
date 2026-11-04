import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import OptionsPage from '@/components/options/OptionsPage';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/options'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'options') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard/options'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <OptionsPage />;
}
