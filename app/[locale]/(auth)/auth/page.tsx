import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { destinationProfile } from '@/lib/auth/destination';
import { destinationFor, IDLE_REASON, safeNextPath } from '@/lib/auth/routes';
import {
  googleSignInAvailable,
  guestSignInAvailable,
  phoneSignInAvailable,
} from '@/lib/auth/providers';
import { uaePassMockEnabled } from '@/lib/auth/uaePass';
import { createClient } from '@/lib/supabase/server';
import { AuthForm } from './components/AuthForm';
import { PrivacyPanel } from './components/PrivacyPanel';

export async function generateMetadata({ params }: PageProps<'/[locale]/auth'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  return { title: t('title') };
}

export default async function AuthPage({ params, searchParams }: PageProps<'/[locale]/auth'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const query = await searchParams;
  const next = safeNextPath(query.next);

  // Signed-in visitors don't need this page, unless they still owe a consent.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let needsConsent = false;
  if (user) {
    const [{ data: consent }, profile] = await Promise.all([
      supabase
        .from('consents')
        .select('id')
        .eq('kind', 'terms')
        .is('revoked_at', null)
        .limit(1)
        .maybeSingle(),
      destinationProfile(supabase, user.id),
    ]);
    if (consent) redirect({ href: destinationFor(profile, next), locale });
    needsConsent = true;
  }

  const [googleEnabled, phoneEnabled, guestEnabled] = await Promise.all([
    googleSignInAvailable(),
    phoneSignInAvailable(),
    guestSignInAvailable(),
  ]);

  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="flex flex-[1_1_480px] flex-col gap-8 px-[clamp(24px,5vw,80px)] pt-8 pb-12">
        <header className="motion-safe:animate-fade-up">
          <Logo />
        </header>
        <main id="main" className="my-auto flex w-full max-w-[440px] flex-col gap-5">
          <AuthForm
            next={next}
            idle={query.reason === IDLE_REASON}
            callbackError={query.error === 'link' || query.error === 'google' ? query.error : null}
            uaePassEnabled={uaePassMockEnabled()}
            googleEnabled={googleEnabled}
            phoneEnabled={phoneEnabled}
            guestEnabled={guestEnabled}
            initialView={needsConsent ? 'consent' : 'start'}
          />
        </main>
      </section>
      <PrivacyPanel />
    </div>
  );
}
