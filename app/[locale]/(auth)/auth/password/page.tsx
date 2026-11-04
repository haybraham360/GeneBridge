import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { safeNextPath } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/server';
import { PrivacyPanel } from '../components/PrivacyPanel';
import { SetPasswordForm } from './SetPasswordForm';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/auth/password'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth.setPassword' });
  return { title: t('title') };
}

/**
 * Set or change a password. Offered after an email-link sign-in; also the way
 * to reset a forgotten password (sign in with a link, then come here).
 */
export default async function SetPasswordPage({
  params,
  searchParams,
}: PageProps<'/[locale]/auth/password'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/auth', locale });

  const next = safeNextPath((await searchParams).next);

  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="flex flex-[1_1_480px] flex-col gap-8 px-[clamp(24px,5vw,80px)] pt-8 pb-12">
        <header className="motion-safe:animate-fade-up">
          <Logo />
        </header>
        <main id="main" className="my-auto flex w-full max-w-[440px] flex-col gap-5">
          <SetPasswordForm next={next} />
        </main>
      </section>
      <PrivacyPanel />
    </div>
  );
}
