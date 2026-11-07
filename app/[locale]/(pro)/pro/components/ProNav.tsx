'use client';

import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  FileText,
  Flag,
  Lock,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

type Key =
  | 'queue'
  | 'sessions'
  | 'patients'
  | 'referrals'
  | 'notes'
  | 'profile'
  | 'availability'
  | 'settings'
  | 'notifications';
type Item = { href: string; key: Key; icon: LucideIcon; mirror?: boolean; patientFacing?: boolean };

const items: Item[] = [
  { href: '/pro', key: 'queue', icon: Flag, patientFacing: true },
  { href: '/pro/sessions', key: 'sessions', icon: CalendarDays, patientFacing: true },
  { href: '/pro/patients', key: 'patients', icon: Users, patientFacing: true },
  { href: '/pro/referrals', key: 'referrals', icon: ArrowRight, mirror: true, patientFacing: true },
  { href: '/pro/notes', key: 'notes', icon: FileText, patientFacing: true },
];

const own: Item[] = [
  { href: '/pro/profile', key: 'profile', icon: UserRound },
  { href: '/pro/availability', key: 'availability', icon: CalendarClock },
  { href: '/pro/settings', key: 'settings', icon: Settings },
  { href: '/pro/notifications', key: 'notifications', icon: Bell },
];

/**
 * The workspace's own menu. Patient pages show a lock until the professional
 * is verified (they still open, to a calm locked state). Stacks on phones.
 */
export function ProNav({ verified }: { verified: boolean }) {
  const t = useTranslations('pro.nav');
  const pathname = usePathname();

  const link = ({ href, key, icon: Icon, mirror, patientFacing }: Item) => {
    const active = href === '/pro' ? pathname === '/pro' : pathname.startsWith(href);
    const locked = patientFacing && !verified;
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
          <span className="flex-1">{t(key)}</span>
          {locked ? (
            <>
              <Lock aria-hidden="true" className="size-4 flex-none opacity-70" strokeWidth={2} />
              <span className="sr-only">{t('lockedLabel')}</span>
            </>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-1 md:flex-col">{items.map(link)}</ul>
      <ul className="flex flex-wrap gap-1 border-t border-line pt-4 md:flex-col">{own.map(link)}</ul>
    </nav>
  );
}
