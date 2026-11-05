import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConditionsBand } from '@/components/marketing/ConditionsBand';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Faq } from '@/components/marketing/Faq';
import { Features } from '@/components/marketing/Features';
import { ForProfessionals } from '@/components/marketing/ForProfessionals';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { Partners } from '@/components/marketing/Partners';
import { PreviewCards } from '@/components/marketing/PreviewCards';
import { PrivacyBand } from '@/components/marketing/PrivacyBand';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { SiteHeader } from '@/components/marketing/SiteHeader';
import { SignedOutToast } from '@/components/auth/SignedOutToast';
import { routing } from '@/i18n/routing';

export default async function LandingPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <div className="relative overflow-x-clip">
      <SiteHeader />
      <main id="main">
        <Hero />
        <PreviewCards />
        <ConditionsBand />
        <Partners />
        <HowItWorks />
        <Features />
        <PrivacyBand />
        <ForProfessionals />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
      <SignedOutToast />
    </div>
  );
}
