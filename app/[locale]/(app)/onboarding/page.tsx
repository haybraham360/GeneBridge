import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { ADMIN_HOME, FINISHED_ONBOARDING_STEP, PRO_HOME } from '@/lib/auth/routes';
import { loadProfessional } from '@/lib/kyc/server';
import { listConditions } from '@/lib/conditions/catalogue';
import { finishFor, followedConditionIds, hasPrivacyConsent } from '@/lib/onboarding/queries';
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
import { ProOnboardingFlow } from './components/ProOnboardingFlow';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/onboarding'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'onboarding.meta' });
  return { title: t('title') };
}

export default async function OnboardingPage({ params, searchParams }: PageProps<'/[locale]/onboarding'>) {
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
    .select('locale, learning_mode, reason, onboarding_step, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile) return redirect({ href: '/auth', locale });

  if (profile.role === 'admin') return redirect({ href: ADMIN_HOME, locale });

  // Health professionals (task 14): their own 4-step onboarding, then /pro.
  if (profile.role === 'professional') {
    const finished = profile.onboarding_step >= FINISHED_ONBOARDING_STEP;
    // ?done=1: the done screen, after switching language on the last step.
    if (finished && (await searchParams).done !== '1') return redirect({ href: PRO_HOME, locale });
    const pro = await loadProfessional(supabase, user.id);
    if (!pro) return redirect({ href: PRO_HOME, locale });
    return (
      <ProOnboardingFlow
        initial={{
          step: finished ? 4 : profile.onboarding_step <= 1 ? 1 : (Math.min(profile.onboarding_step, 3) as 2 | 3),
          details: {
            displayName: pro.displayName,
            profession: pro.profession ?? '',
            specialties: pro.specialties,
            languages: pro.languages.length ? pro.languages : [locale],
            yearsExperience: pro.yearsExperience === null ? '' : String(pro.yearsExperience),
            facilityName: pro.facilityName ?? '',
            bio: pro.bio ?? '',
          },
          language: profile.locale === 'ar' ? 'ar' : profile.locale === 'en' ? 'en' : locale,
          notifyEmail: pro.notifyEmail,
        }}
      />
    );
  }

  // Finished: later visits go straight to the dashboard.
  if (profile.onboarding_step >= DONE_STEP) return redirect({ href: '/dashboard', locale });

  // Resume in the language they chose, on any device.
  const preferred = uiLocaleFor(profile.locale);
  if (profile.onboarding_step >= 2 && preferred !== locale) {
    return redirect({ href: '/onboarding', locale: preferred });
  }

  const [privacyAgreed, finish, followed] = await Promise.all([
    hasPrivacyConsent(supabase),
    finishFor(supabase, user.id),
    followedConditionIds(supabase, user.id),
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
        conditions: listConditions(locale),
        followed,
      }}
    />
  );
}
