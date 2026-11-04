import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'pro') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <PlaceholderPage locale={locale} screen="pro" showSignOut />;
}
