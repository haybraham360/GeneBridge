import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { InvitePartner } from '@/components/couple/InvitePartner';
import { ConsentForm } from '@/components/couple/ConsentForm';
import { routing } from '@/i18n/routing';
import { loadConsentStatus } from '@/lib/couple/view';
import { currentPerson } from '@/lib/profile/currentPerson';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/couple/consent'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'couple.meta' });
  return { title: t('consentTitle') };
}

/**
 * Unlock your couple view (design CoupleConsent). Each partner agrees
 * separately and chooses how much to share. Not linked yet: invite first.
 */
export default async function ConsentPage({ params }: PageProps<'/[locale]/dashboard/couple/consent'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const supabase = await createClient();
  const [t, consent, person] = await Promise.all([
    getTranslations({ locale, namespace: 'couple.consent' }),
    loadConsentStatus(supabase),
    currentPerson(supabase),
  ]);

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </header>
      {consent.linked ? (
        <ConsentForm consent={consent} myInitial={person.initial} />
      ) : (
        <section className="mt-6 flex max-w-2xl flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-[15px] leading-[1.6]">{t('noPartner')}</p>
          {/* The onboarding invite (task 04): a neutral message, never a result. */}
          <InvitePartner />
        </section>
      )}
    </main>
  );
}
