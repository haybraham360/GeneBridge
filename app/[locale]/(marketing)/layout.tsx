import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { clientMessages } from '@/i18n/clientMessages';
import { routing } from '@/i18n/routing';

/**
 * Marketing pages: only the client messages this group uses (see
 * i18n/clientMessages). Setting the locale here, not reading it from the
 * request, lets these pages be prerendered and served as static files.
 */
export default async function MarketingLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <NextIntlClientProvider messages={await clientMessages(['common', 'landing'])}>{children}</NextIntlClientProvider>;
}
