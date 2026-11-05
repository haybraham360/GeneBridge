import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LanguageSwitch } from '@/components/marketing/LanguageSwitch';
import { Logo } from '@/components/ui/Logo';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/*
 * Public family notice pages (task 08). No sign-in, no cookies, no analytics
 * scripts, no third-party requests (the proxy sets a strict CSP). Only the
 * few client strings these pages use are sent to the browser, to keep the
 * page light on slow phones.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  // Nothing about the notice in previews or the referrer.
  referrer: 'no-referrer',
};

export default async function NoticeLayout({ children, params }: LayoutProps<'/[locale]/family-notice'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [messages, t] = await Promise.all([getMessages(), getTranslations({ locale, namespace: 'notice.footer' })]);
  const clientMessages = {
    notice: { listen: messages.notice.listen, ask: messages.notice.ask },
    landing: { language: messages.landing.language },
  };

  return (
    <NextIntlClientProvider messages={clientMessages}>
      <div className="flex min-h-screen flex-col bg-bg text-ink">
        <header className="mx-auto flex w-full max-w-[1000px] items-center justify-between gap-4 p-6">
          <Logo />
          <LanguageSwitch className="rounded-full border border-line-strong bg-surface px-3.5 font-bold text-ink hover:bg-brand-tint-soft" />
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mx-auto flex w-full max-w-[1000px] flex-wrap justify-between gap-3 border-t border-[#EADBD0] p-6 text-sm text-muted">
          <span>{t('copyright')}</span>
          <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center text-muted underline underline-offset-2">
            {t('about')}
          </Link>
        </footer>
      </div>
    </NextIntlClientProvider>
  );
}
