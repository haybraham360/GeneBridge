import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { IdleSignOut } from '@/components/auth/IdleSignOut';
import { routing } from '@/i18n/routing';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { loadMe } from '@/lib/pro/server';
import { ProSidebar } from './components/ProSidebar';
import { VerificationBanner } from './components/VerificationBanner';

/**
 * Professional workspace shell (tasks 07 and 14): its own side menu, stacked
 * above the content on phones. Any professional may open it; until they're
 * verified the patient pages are locked (the (workspace) layout) and the
 * database returns nothing about any patient.
 */
export default async function ProLayout({ children, params }: LayoutProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const ctx = await requireProfessionalPage();
  const tl = await getTranslations({ locale, namespace: 'proOnboarding.labels' });

  // The facility name comes from the workspace record, which exists once verified.
  const me = ctx.verified ? await loadMe(ctx.supabase) : null;
  const name = ctx.profile.displayName || me?.name || '';
  const subline = me?.facilityName ?? (ctx.profile.profession ? tl(`profession.${ctx.profile.profession}`) : '');

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <ProSidebar name={name} subline={subline} verified={ctx.verified} />
      <main id="main" className="flex min-w-0 flex-1 flex-col gap-6 px-[clamp(16px,3vw,40px)] pt-8 pb-12">
        <VerificationBanner state={ctx.banner} welcomeSeen={Boolean(ctx.profile.welcomeSeenAt)} />
        {children}
      </main>
      <IdleSignOut />
    </div>
  );
}
