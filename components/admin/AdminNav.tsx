'use client';

import { CalendarX, ClipboardCheck, DatabaseZap, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

const VERIFICATIONS = '/admin/verifications';
const DEMO_DATA = '/admin/demo-data';

const items = [
  { key: 'queue', href: VERIFICATIONS, icon: ClipboardCheck },
  { key: 'professionals', href: `${VERIFICATIONS}?tab=professionals`, icon: UserCheck },
  { key: 'bookings', href: `${VERIFICATIONS}?tab=bookings`, icon: CalendarX },
  { key: 'demoData', href: DEMO_DATA, icon: DatabaseZap },
] as const;

export function AdminNav() {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();
  const tab = useSearchParams().get('tab') ?? 'queue';

  const isActive = (key: (typeof items)[number]['key']) => {
    if (key === 'demoData') return pathname === DEMO_DATA;
    if (pathname === VERIFICATIONS) return tab === key;
    // A submission's detail page sits under the queue.
    return key === 'queue' && pathname.startsWith(`${VERIFICATIONS}/`);
  };

  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items.map(({ key, href, icon: Icon }) => {
          const active = isActive(key);
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
                <Icon aria-hidden="true" className="size-5 flex-none" strokeWidth={2} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
