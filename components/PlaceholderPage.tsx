import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Logo } from '@/components/ui/Logo';
import type { Locale } from '@/i18n/routing';

export type PlaceholderScreen =
  | 'auth'
  | 'counsellor'
  | 'results'
  | 'couple'
  | 'simulator'
  | 'family'
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'dashboard';

/** Temporary stand-in so landing-page links resolve until each milestone ships. */
export async function PlaceholderPage({ locale, screen }: { locale: Locale; screen: PlaceholderScreen }) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'common.placeholder' });

  return (
    <div className="mx-auto flex min-h-screen max-w-page flex-col p-6">
      <header>
        <Logo />
      </header>
      <main id="main" className="flex flex-1 flex-col items-center justify-center gap-5 py-16 text-center">
        <Chip>{t('eyebrow')}</Chip>
        <h1 className="text-[32px] font-extrabold tracking-[-0.02em]">{t(`screens.${screen}`)}</h1>
        <p className="max-w-120 text-[15px] leading-[1.55] text-muted">{t('body')}</p>
        <Button href="/" variant="dark">
          {t('back')}
        </Button>
      </main>
    </div>
  );
}

export async function placeholderMetadata(locale: Locale, screen: PlaceholderScreen) {
  const t = await getTranslations({ locale, namespace: 'common.placeholder' });
  return { title: `${t(`screens.${screen}`)} · GeneBridge` };
}
