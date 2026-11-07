import { BadgeCheck, CalendarCheck, Lock, Share2, Stethoscope } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/trust'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'booking.trust' });
  return { title: `${t('title')} · GeneBridge` };
}

const ITEMS = [
  { key: 'verified', icon: BadgeCheck },
  { key: 'chat', icon: Lock },
  { key: 'sharing', icon: Share2 },
  { key: 'calendar', icon: CalendarCheck },
] as const;

/** Trust & safety (task 15, section 6), including the telehealth compliance note. */
export default async function TrustPage({ params }: PageProps<'/[locale]/trust'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, tb] = await Promise.all([getTranslations({ locale, namespace: 'booking.trust' }), getTranslations({ locale, namespace: 'booking' })]);
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-[clamp(16px,4vw,40px)] py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(32px,5vw,44px)] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[17px] text-muted">{t('subtitle')}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {ITEMS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 shadow-card">
            <Icon aria-hidden className="size-5 text-brand-text" />
            <h2 className="text-[17px] font-extrabold">{t(`items.${key}.title`)}</h2>
            <p className="text-[15px] text-muted">{t(`items.${key}.body`)}</p>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-2 rounded-card border border-line bg-brand-tint-soft p-5" data-testid="compliance-note">
        <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
          <Stethoscope aria-hidden className="size-5 text-brand-text" /> {t('complianceTitle')}
        </h2>
        <p className="text-[15px]">{tb('compliance')}</p>
      </section>
    </main>
  );
}
