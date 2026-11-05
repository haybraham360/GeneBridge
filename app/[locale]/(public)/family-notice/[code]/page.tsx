import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { loadNotice } from '@/lib/notices/server';
import { NoticeBody } from '../NoticeBody';

// Every visit reads the notice: never cached, never prerendered.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/[code]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  // The same title for every notice and state: nothing about the sender or condition.
  const t = await getTranslations({ locale, namespace: 'notice.meta' });
  return { title: t('title') };
}

/**
 * The relative's page (task 08). Valid, invalid, expired and stopped codes
 * all answer 200 with the same layout, so codes can't be probed.
 */
export default async function FamilyNoticePage({ params }: PageProps<'/[locale]/family-notice/[code]'>) {
  const { locale, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const view = await loadNotice(code);
  return <NoticeBody view={view} code={view.status === 'invalid' ? null : code} />;
}
