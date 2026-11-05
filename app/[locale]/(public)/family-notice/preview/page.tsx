import type { Metadata } from 'next';
import { Eye } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cleanSignedName, isNoticeCondition, type NoticeView } from '@/lib/notices/types';
import { NoticeBody } from '../NoticeBody';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/preview'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.preview' });
  return { title: t('metaTitle') };
}

/**
 * The sender's preview (signed in; the proxy checks). Renders exactly the
 * relative's page from the options chosen on the family map, with a Preview
 * banner. Reads and writes nothing: no notice is created.
 */
export default async function PreviewPage({ params, searchParams }: PageProps<'/[locale]/family-notice/preview'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'notice.preview' });

  const condition = typeof query.condition === 'string' && isNoticeCondition(query.condition) ? query.condition : null;
  const signedName = query.anonymous === '0' ? cleanSignedName(query.name) : null;
  const view: NoticeView = { status: 'valid', locale, conditionId: condition, signedName };

  return (
    <>
      <div className="mx-auto w-full max-w-[1000px] px-6">
      <div
        role="note"
        className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-tile bg-info-tint px-5 py-3 text-base font-semibold text-info-text"
      >
        <span className="flex items-center gap-2.5">
          <Eye aria-hidden="true" className="size-5 flex-none" strokeWidth={2} />
          {t('banner')}
        </span>
        <Link href="/dashboard/family" className="inline-flex min-h-11 items-center underline underline-offset-2">
          {t('back')}
        </Link>
      </div>
      </div>
      <NoticeBody view={view} code={null} preview />
    </>
  );
}
