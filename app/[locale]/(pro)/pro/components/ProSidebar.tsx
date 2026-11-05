import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LanguageSwitch } from '@/components/marketing/LanguageSwitch';
import { Logo } from '@/components/ui/Logo';
import { isDemoData } from '@/lib/analytics/demo';
import { signOut } from '@/lib/auth/actions';
import { initialsOf } from '@/lib/pro/labels';
import type { CounsellorMe } from '@/lib/pro/types';
import { ProNav } from './ProNav';

/** White side menu: logo, "Counsellor workspace", links, and who is signed in. */
export function ProSidebar({ me }: { me: CounsellorMe }) {
  const t = useTranslations('pro.nav');
  const tc = useTranslations('common');

  return (
    <aside className="flex flex-col gap-7 border-b border-line bg-surface px-4 py-7 md:sticky md:top-0 md:h-screen md:w-66 md:flex-none md:overflow-y-auto md:border-e md:border-b-0">
      <div className="flex flex-col gap-1.5 px-2">
        <Logo size="sm" className="self-start" />
        <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">{t('workspace')}</span>
      </div>

      <ProNav />

      <div className="flex flex-col gap-4 md:mt-auto">
        <div className="flex flex-wrap items-center gap-x-4 px-2 text-sm font-semibold">
          <LanguageSwitch className="text-brand-text underline-offset-4 hover:underline" />
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-ink-soft hover:text-ink"
            >
              <LogOut aria-hidden="true" className="size-4 rtl:-scale-x-100" strokeWidth={2} />
              {tc('signOut')}
            </button>
          </form>
        </div>
        <div className="flex items-center gap-3 px-2">
          <span
            aria-hidden="true"
            className="flex size-10 flex-none items-center justify-center rounded-full bg-ink font-extrabold text-white"
          >
            {initialsOf(me.name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{me.name}</span>
            <span className="truncate text-xs text-muted">{me.facilityName}</span>
          </span>
        </div>
        {isDemoData() ? (
          <p className="px-2 text-xs font-bold text-brand-text-dark">{t('synthetic')}</p>
        ) : null}
      </div>
    </aside>
  );
}
