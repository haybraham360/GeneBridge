import { useTranslations } from 'next-intl';
import { Logo } from '@/components/ui/Logo';
import { Link } from '@/i18n/navigation';

const links = [
  { key: 'privacy', href: '/privacy' },
  { key: 'terms', href: '/terms' },
  { key: 'contact', href: '/contact' },
] as const;

export function SiteFooter() {
  const t = useTranslations('landing.footer');

  return (
    <footer className="mx-auto mt-16 flex max-w-[1200px] flex-wrap items-center justify-between gap-4 border-t border-[#EADBD0] px-6 pt-8 pb-12">
      <Logo size="sm" />
      <div className="flex flex-wrap items-center gap-x-5 text-sm text-muted">
        <span>{t('copyright')}</span>
        <nav aria-label={t('linksLabel')}>
          <ul className="flex flex-wrap gap-x-5">
            {links.map(({ key, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center text-muted underline underline-offset-2 hover:text-ink"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
