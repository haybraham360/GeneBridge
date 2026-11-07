import { Lock } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { canSubmit } from '@/lib/kyc/types';
import { requireProfessionalPage } from '@/lib/kyc/server';

/**
 * Patient-facing workspace pages: queue, sessions, patients, referrals,
 * session notes, video (task 14, section 4). Until the professional is
 * verified they show a calm locked state and load no patient data at all.
 * The database enforces the same rule (is_verified_professional), so this
 * is the courtesy, not the lock.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const ctx = await requireProfessionalPage();
  if (ctx.verified) return children;

  const t = await getTranslations({ locale, namespace: 'verify.locked' });
  return (
    <section data-testid="locked-state" aria-labelledby="locked-title" className={cn(cardClasses, 'mx-auto mt-4 flex w-full max-w-xl flex-col items-center gap-4 p-10 text-center')}>
      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-brand-tint">
        <Lock className="size-6 text-brand-text" strokeWidth={2} />
      </span>
      <h1 id="locked-title" className="text-2xl font-extrabold tracking-[-0.02em]">
        {t('title')}
      </h1>
      <p className="max-w-md text-[15px] text-muted">{t(ctx.profile.status === 'suspended' ? 'suspended' : 'body')}</p>
      {canSubmit(ctx.profile.status) ? (
        <Link href="/pro/verify" className={buttonClasses('primary', 'md')}>
          {t('cta')}
        </Link>
      ) : null}
    </section>
  );
}
