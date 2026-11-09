import type { Metadata } from 'next';
import { Alexandria, Fraunces, IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localeDirection, routing } from '@/i18n/routing';
import '../globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

// IBM Plex Sans Arabic tops out at 700; 800 headings render at 700 in Arabic.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

// Display faces for page titles and big section headlines only (see
// `font-display` in globals.css). Body and UI text stay in Jakarta / Plex.
// Fraunces is variable: its soft and optical-size axes keep big titles warm.
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});

// Alexandria: modern Arabic display face with true heavy weights (100–900).
// Loads Latin too, so names and digits inside Arabic headlines match.
const alexandria = Alexandria({
  subsets: ['arabic', 'latin'],
  variable: '--font-alexandria',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'landing.meta' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <html
      lang={locale}
      dir={localeDirection[locale]}
      className={`${jakarta.variable} ${plexArabic.variable} ${fraunces.variable} ${alexandria.variable}`}
    >
      <body>
        <a
          href="#main"
          className="sr-only rounded-full bg-ink px-5 py-3 font-bold text-white focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-50"
        >
          {t('skipToContent')}
        </a>
        {/*
          Each route group adds its own NextIntlClientProvider, so the public
          family notice pages ship only their own messages (task 08).
        */}
        {children}
      </body>
    </html>
  );
}
