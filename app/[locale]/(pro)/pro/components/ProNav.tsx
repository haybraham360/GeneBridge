'use client';

import { ArrowRight, CalendarDays, FileText, Flag, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

type Item = { href: string; key: 'queue' | 'sessions' | 'patients' | 'referrals' | 'notes'; icon: LucideIcon; mirror?: boolean };

const items: Item[] = [
  { href: '/pro', key: 'queue', icon: Flag },
  { href: '/pro/sessions', key: 'sessions', icon: CalendarDays },
  { href: '/pro/patients', key: 'patients', icon: Users },
  { href: '/pro/referrals', key: 'referrals', icon: ArrowRight, mirror: true },
  { href: '/pro/notes', key: 'notes', icon: FileText },
];

/** The workspace's own menu. Stacks above the content on phones. */
export function ProNav() {
  const t = useTranslations('pro.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items.map(({ href, key, icon: Icon, mirror }) => {
          const active = href === '/pro' ? pathname === '/pro' : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold no-underline transition-colors',
                  active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-brand-tint hover:text-ink',
                )}
              >
                <Icon aria-hidden="true" className={cn('size-5 flex-none', mirror && 'rtl:-scale-x-100')} strokeWidth={2} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
