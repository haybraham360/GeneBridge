import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NoticeColumn } from '@/components/notice/NoticeParts';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { stopAction } from '../../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/[code]/stop'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.stop' });
  return { title: t('metaTitle') };
}

/** "Stop them": confirm, then the number is suppressed straight away. No sign-in. */
export default async function StopPage({ params }: PageProps<'/[locale]/family-notice/[code]/stop'>) {
  const { locale, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'notice.stop' });

  return (
    <NoticeColumn>
      <section
        aria-labelledby="stop-title"
        className={cn(cardClasses, 'flex flex-col gap-[18px] rounded-[28px] p-[clamp(24px,5vw,56px)] shadow-none')}
      >
        <h1 id="stop-title" className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]">
          {t('title')}
        </h1>
        <p className="max-w-[680px] text-[17px] leading-[1.6] md:text-lg">{t('body')}</p>
        <form action={stopAction} className="flex flex-wrap gap-3">
          <input type="hidden" name="code" value={code} />
          <button type="submit" className={buttonClasses('dark', 'md', 'min-h-[52px]')}>
            {t('confirm')}
          </button>
          <Link href={`/family-notice/${code}`} prefetch={false} className={buttonClasses('ghost', 'md', 'min-h-[52px]')}>
            {t('cancel')}
          </Link>
        </form>
      </section>
    </NoticeColumn>
  );
}
