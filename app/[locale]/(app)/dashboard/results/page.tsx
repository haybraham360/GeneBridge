import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import ResultPage from '@/components/result/ResultPage';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/results'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'results') : {};
}

export default async function Page({ params }: PageProps<'/[locale]/dashboard/results'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <ResultPage />;
}