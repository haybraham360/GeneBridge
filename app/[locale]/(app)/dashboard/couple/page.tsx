import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import CoupleView from '@/components/couple/CoupleView';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/couple'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'couple') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard/couple'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <CoupleView />;
}