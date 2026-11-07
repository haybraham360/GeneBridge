import { ShieldCheck } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { IdleSignOut } from '@/components/auth/IdleSignOut';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { LanguageSwitch } from '@/components/marketing/LanguageSwitch';
import { Logo } from '@/components/ui/Logo';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/lib/kyc/server';
import { AdminNav } from './components/AdminNav';

/**
 * Verification review (task 14, section 6). Admins only: the proxy returns a
 * 404 for anyone else, this checks again, and every kyc_admin_* database
 * function checks the role itself.
 */
export default async function AdminLayout({ children, params }: LayoutProps<'/[locale]/admin/verifications'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  await requireAdminPage();
  const t = await getTranslations({ locale, namespace: 'admin.nav' });

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <aside className="flex flex-col gap-7 border-b border-line bg-surface px-4 py-7 md:sticky md:top-0 md:h-screen md:w-66 md:flex-none md:overflow-y-auto md:border-e md:border-b-0">
        <div className="flex flex-col gap-1.5 px-2">
          <Logo size="sm" className="self-start" />
          <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">{t('title')}</span>
        </div>
        <Suspense>
          <AdminNav />
        </Suspense>
        <div className="flex flex-col gap-4 md:mt-auto">
          <div className="px-2 text-sm font-semibold">
            <LanguageSwitch className="text-brand-text underline-offset-4 hover:underline" />
          </div>
          <div className="rounded-tile bg-brand-tint-soft p-4 text-[13px] leading-normal">
            <ShieldCheck aria-hidden="true" className="size-4.5 text-brand-text" strokeWidth={2} />
            <p className="mt-2">{t('privacyNote')}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main id="main" className="flex min-w-0 flex-1 flex-col gap-6 px-[clamp(16px,3vw,40px)] pt-8 pb-12">
        {children}
      </main>
      <IdleSignOut />
    </div>
  );
}
