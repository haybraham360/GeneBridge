import { useTranslations } from 'next-intl';
import { Logo } from '@/components/ui/Logo';
import { Link } from '@/i18n/navigation';
import { LanguageSwitch } from './LanguageSwitch';
import { MobileMenu } from './MobileMenu';
import { navItems } from './navItems';

const pillLink =
  'inline-flex min-h-11 items-center px-3 text-sm font-semibold text-white no-underline hover:text-brand-ring focus-visible:outline-white';

export function SiteHeader() {
  const t = useTranslations('landing.header');

  return (
    <header className="relative mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 p-6">
      <Logo />

      <nav
        aria-label={t('navLabel')}
        className="hidden items-center gap-0.5 rounded-full bg-ink py-1.5 ps-3.5 pe-1.5 lg:flex"
      >
        {navItems.map((item) => (
          <a key={item.key} href={item.href} className={pillLink}>
            {t(item.key)}
          </a>
        ))}
        <LanguageSwitch className={pillLink} />
        <Link
          href="/auth"
          className="ms-1 inline-flex min-h-11 items-center rounded-full bg-white px-[18px] text-sm font-bold text-ink no-underline hover:bg-brand-tint-soft focus-visible:outline-white"
        >
          {t('getStarted')}
        </Link>
      </nav>

      <MobileMenu />
    </header>
  );
}
