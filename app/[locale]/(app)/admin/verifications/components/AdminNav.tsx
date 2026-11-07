'use client';

import { CalendarX, ClipboardCheck, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

const items = [
  { tab: 'queue', icon: ClipboardCheck },
  { tab: 'professionals', icon: UserCheck },
  { tab: 'bookings', icon: CalendarX },
] as const;

export function AdminNav() {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();
  const tab = useSearchParams().get('tab') ?? 'queue';
  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items.map(({ tab: key, icon: Icon }) => {
          const active = pathname === '/admin/verifications' ? tab === key : key === 'queue';
          return (
            <li key={key}>
              <Link
                href={key === 'queue' ? '/admin/verifications' : `/admin/verifications?tab=${key}`}
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
