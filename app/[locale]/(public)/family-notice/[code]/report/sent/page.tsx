import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NoticeColumn, PrivacyBox } from '@/components/notice/NoticeParts';
import { cardClasses } from '@/components/ui/Card';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';

// Rendered per request so Next's scripts carry this response's CSP nonce.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/[code]/report/sent'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.report' });
  return { title: t('metaTitle') };
}

export default async function ReportSentPage({ params }: PageProps<'/[locale]/family-notice/[code]/report/sent'>) {
  const { locale, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'notice.report' });
  return (
    <NoticeColumn>
      <section
        role="status"
        aria-labelledby="sent-title"
        className={cn(cardClasses, 'flex flex-col gap-[18px] rounded-[28px] p-[clamp(24px,5vw,56px)] shadow-none')}
      >
        <h1 id="sent-title" className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]">
          {t('doneTitle')}
        </h1>
        <p className="max-w-[680px] text-[17px] leading-[1.6] md:text-lg">{t('doneBody')}</p>
      </section>
      <PrivacyBox code={code} />
    </NoticeColumn>
  );
}
