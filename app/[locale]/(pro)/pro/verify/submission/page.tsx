import { CircleCheck } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { REVIEW_DAYS } from '@/lib/kyc/types';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/verify/submission'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'verify.submission' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * "View submission" (read-only). Shows what the professional typed and the
 * status, never the documents: those are encrypted and only an admin can
 * open them.
 */
export default async function SubmissionPage({ params, searchParams }: PageProps<'/[locale]/pro/verify/submission'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ latest }, t, tl, format, query] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'verify.submission' }),
    getTranslations({ locale, namespace: 'proOnboarding.labels' }),
    getFormatter({ locale }),
    searchParams,
  ]);
  if (!latest) return redirect({ href: '/pro/verify', locale });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {query.sent === '1' ? (
        <section role="status" data-testid="kyc-sent" className="flex items-start gap-3 rounded-card border border-success-tint bg-success-tint p-5">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-6 flex-none text-success-text" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-extrabold">{t('sentTitle')}</h2>
            <p className="text-[15px]">{t('sentBody', { days: REVIEW_DAYS })}</p>
          </div>
        </section>
      ) : null}
      <section className={cn(cardClasses, 'flex flex-col gap-4 p-[clamp(20px,4vw,32px)]')}>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-[auto_1fr]">
          <dt className="font-bold">{t('status')}</dt>
          <dd data-testid="submission-status">{t(`statuses.${latest.status}`)}</dd>
          <dt className="font-bold">{t('submitted')}</dt>
          <dd>{format.dateTime(new Date(latest.created_at), { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          <dt className="font-bold">{t('number')}</dt>
          <dd>
            <bdi dir="ltr">{latest.entered_licence_number}</bdi>
          </dd>
          <dt className="font-bold">{t('authority')}</dt>
          <dd>{latest.entered_authority === 'other' ? latest.entered_authority_other : tl(`authority.${latest.entered_authority}`)}</dd>
          <dt className="font-bold">{t('expiry')}</dt>
          <dd>
            <bdi dir="ltr">{latest.entered_expiry}</bdi>
          </dd>
          {latest.reviewer_notes ? (
            <>
              <dt className="font-bold">{t('message')}</dt>
              <dd>{latest.reviewer_notes}</dd>
            </>
          ) : null}
        </dl>
        <p className="text-sm text-muted">{t('documentsNote')}</p>
        <Link href="/pro" className={buttonClasses('ghost', 'md', 'self-start')}>
          {t('back')}
        </Link>
      </section>
    </div>
  );
}
