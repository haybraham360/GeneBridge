'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/cn';

type LanguageSwitchProps = {
  className?: string;
  onNavigate?: () => void;
};

export function LanguageSwitch({ className, onNavigate }: LanguageSwitchProps) {
  const t = useTranslations('landing.language');
  const locale = useLocale();
  const pathname = usePathname();
  const target: Locale = locale === 'ar' ? 'en' : 'ar';

  // No aria-label: the visible language name (marked with `lang`) is the
  // accessible name, so speech-input users can say what they see.
  return (
    <Link
      href={pathname}
      locale={target}
      lang={target}
      hrefLang={target}
      onClick={onNavigate}
      className={cn('inline-flex min-h-11 items-center no-underline', className)}
    >
      {t('switchTo')}
    </Link>
  );
}
