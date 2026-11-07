import { BadgeCheck } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { canSubmit } from '@/lib/kyc/types';
import { VerifyFlow } from './VerifyFlow';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/verify'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'verify.flow' });
  return { title: t('meta'), robots: { index: false } };
}

/** /pro/verify (task 14, section 5). Resubmissions start from what they typed last time. */
export default async function VerifyPage({ params }: PageProps<'/[locale]/pro/verify'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ profile, latest, banner }, t] = await Promise.all([requireProfessionalPage(), getTranslations({ locale, namespace: 'verify.flow' })]);

  if (banner.kind === 'pending') return redirect({ href: '/pro/verify/submission', locale });

  if (!canSubmit(profile.status)) {
    return (
      <section className={cn(cardClasses, 'mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-10 text-center')}>
        <BadgeCheck aria-hidden="true" className="size-10 text-success-text" />
        <h1 className="text-2xl font-extrabold">{t(profile.status === 'suspended' ? 'suspendedTitle' : 'verifiedTitle')}</h1>
        <p className="text-[15px] text-muted">{t(profile.status === 'suspended' ? 'suspendedBody' : 'verifiedBody')}</p>
        <Link href="/pro" className={buttonClasses('ghost', 'md')}>
          {t('toDashboard')}
        </Link>
      </section>
    );
  }

  return (
    <VerifyFlow
      today={new Date().toISOString().slice(0, 10)}
      initial={{
        licenceNumber: latest?.entered_licence_number ?? '',
        authority: latest?.entered_authority ?? '',
        authorityOther: latest?.entered_authority_other ?? '',
        // An expired licence needs a new date.
        expiry: profile.status === 'expired' ? '' : (latest?.entered_expiry ?? ''),
      }}
    />
  );
}
