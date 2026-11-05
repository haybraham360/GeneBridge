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
import { reportReasons } from '@/lib/notices/server';
import { reportAction } from '../../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/family-notice/[code]/report'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'notice.report' });
  return { title: t('metaTitle') };
}

/**
 * "Report misuse": creates a review record. The recipient is never told
 * anything about the sender, and the sender isn't told about the report.
 */
export default async function ReportPage({ params, searchParams }: PageProps<'/[locale]/family-notice/[code]/report'>) {
  const { locale, code } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { missing } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'notice.report' });

  return (
    <NoticeColumn>
      <section
        aria-labelledby="report-title"
        className={cn(cardClasses, 'flex flex-col gap-[18px] rounded-[28px] p-[clamp(24px,5vw,56px)] shadow-none')}
      >
        <h1 id="report-title" className="text-[clamp(28px,4vw,40px)] leading-[1.15] font-extrabold tracking-[-0.02em]">
          {t('title')}
        </h1>
        <p className="max-w-[680px] text-[17px] leading-[1.6] md:text-lg">{t('body')}</p>
        <form action={reportAction} className="flex flex-col gap-4">
          <input type="hidden" name="code" value={code} />
          <fieldset className="flex flex-col gap-2" aria-describedby={missing ? 'reason-error' : undefined}>
            <legend className="mb-2 text-base font-bold">{t('legend')}</legend>
            {reportReasons.map((reason) => (
              <label
                key={reason}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-tile border border-line px-4 py-3 text-base has-[:checked]:border-ink has-[:checked]:bg-brand-tint-soft"
              >
                <input type="radio" name="reason" value={reason} required className="size-5 accent-ink" />
                {t(`reasons.${reason}`)}
              </label>
            ))}
          </fieldset>
          {missing ? (
            <p id="reason-error" role="alert" className="text-base font-semibold text-danger">
              {t('required')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClasses('dark', 'md', 'min-h-[52px]')}>
              {t('submit')}
            </button>
            <Link href={`/family-notice/${code}`} prefetch={false} className={buttonClasses('ghost', 'md', 'min-h-[52px]')}>
              {t('back')}
            </Link>
          </div>
        </form>
      </section>
    </NoticeColumn>
  );
}
