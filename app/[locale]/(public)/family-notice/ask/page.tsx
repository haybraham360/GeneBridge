import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NoticeColumn, PrivacyBox } from '@/components/notice/NoticeParts';
import { routing } from '@/i18n/routing';
import { MAX_MESSAGE_LENGTH } from '@/lib/assistant/respond';
import { logNoticeEvent } from '@/lib/notices/server';
import { AskForm } from './AskForm';

// Rendered per request so Next's scripts carry this response's CSP nonce.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/ask'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.ask' });
  return { title: t('metaTitle') };
}

/**
 * Public, general-only Ask GeneBridge for relatives (Level 1, no sign-up,
 * no personal data). Opening it counts one notice_question_clicked.
 */
export default async function AskPage({ params }: PageProps<'/[locale]/family-notice/ask'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t] = await Promise.all([
    getTranslations({ locale, namespace: 'notice.ask' }),
    logNoticeEvent('notice_question_clicked'),
  ]);

  return (
    <NoticeColumn>
      <section aria-labelledby="ask-title" className="flex flex-col gap-3 motion-safe:animate-fade-up">
        <h1 id="ask-title" className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]">
          {t('title')}
        </h1>
        <p className="max-w-[680px] text-[17px] leading-[1.6] text-muted md:text-lg">{t('subtitle')}</p>
      </section>
      <AskForm maxLength={MAX_MESSAGE_LENGTH} />
      <PrivacyBox code={null} />
    </NoticeColumn>
  );
}
