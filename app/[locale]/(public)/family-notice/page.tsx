import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { loadNotice } from '@/lib/notices/server';
import { NoticeBody } from './NoticeBody';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.meta' });
  return { title: t('title') };
}

/** A notice link with the code missing: the neutral "isn't valid" page. */
export default async function FamilyNoticeIndex({ params }: PageProps<'/[locale]/family-notice'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Same database round trip as a real code, so timing gives nothing away.
  const view = await loadNotice('');
  return <NoticeBody view={view} code={null} />;
}
