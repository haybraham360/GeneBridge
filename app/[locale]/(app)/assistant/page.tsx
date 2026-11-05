import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/** /assistant opens the chat inside the dashboard (task 06). */
export default async function Page({ params }: PageProps<'/[locale]/assistant'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  redirect({ href: '/dashboard/assistant', locale });
}
