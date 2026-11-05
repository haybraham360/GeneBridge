import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { finishFor, hasPrivacyConsent } from '@/lib/onboarding/queries';
import {
  DONE_STEP,
  isLanguageChoice,
  isLearningMode,
  isReason,
  resumeStep,
  uiLocaleFor,
} from '@/lib/onboarding/steps';
import { createClient } from '@/lib/supabase/server';
import { OnboardingFlow } from './components/OnboardingFlow';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/onboarding'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'onboarding.meta' });
  return { title: t('title') };
}

export default async function OnboardingPage({ params }: PageProps<'/[locale]/onboarding'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // The proxy already requires a session; this keeps the page safe on its own.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect({ href: '/auth?next=/onboarding', locale });

  const { data: profile } = await supabase
    .from('profiles')
    .select('locale, learning_mode, reason, onboarding_step')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile) return redirect({ href: '/auth', locale });

  // Finished: later visits go straight to the dashboard.
  if (profile.onboarding_step >= DONE_STEP) return redirect({ href: '/dashboard', locale });

  // Resume in the language they chose, on any device.
  const preferred = uiLocaleFor(profile.locale);
  if (profile.onboarding_step >= 2 && preferred !== locale) {
    return redirect({ href: '/onboarding', locale: preferred });
  }

  const [privacyAgreed, finish] = await Promise.all([
    hasPrivacyConsent(supabase),
    finishFor(supabase, user.id),
  ]);

  return (
    <OnboardingFlow
      initial={{
        step: resumeStep(profile.onboarding_step),
        language: isLanguageChoice(profile.locale) ? profile.locale : locale,
        learningMode: isLearningMode(profile.learning_mode) ? profile.learning_mode : null,
        reason: isReason(profile.reason) ? profile.reason : null,
        privacyAgreed,
        resultConnected: finish.resultConnected,
        finish,
      }}
    />
  );
}
