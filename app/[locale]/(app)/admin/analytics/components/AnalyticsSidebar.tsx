import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LanguageSwitch } from '@/components/marketing/LanguageSwitch';
import { Logo } from '@/components/ui/Logo';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { AnalyticsNav } from './AnalyticsNav';

/** White side menu: logo, "Programme view", section links, privacy note. */
export function AnalyticsSidebar() {
  const t = useTranslations('analytics');

  return (
    <aside className="flex flex-col gap-7 border-b border-line bg-surface px-4 py-7 md:sticky md:top-0 md:h-screen md:w-66 md:flex-none md:overflow-y-auto md:border-e md:border-b-0">
      <div className="flex flex-col gap-1.5 px-2">
        <Logo size="sm" className="self-start" />
        <span className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
          {t('nav.programmeView')}
        </span>
      </div>

      <AnalyticsNav />

      <div className="flex flex-col gap-4 md:mt-auto">
        <div className="flex flex-wrap items-center gap-x-4 px-2 text-sm font-semibold">
          <LanguageSwitch className="text-brand-text underline-offset-4 hover:underline" />
        </div>
        <div className="rounded-tile bg-brand-tint-soft p-4 text-[13px] leading-normal">
          <Lock aria-hidden="true" className="size-4.5 text-brand-text" strokeWidth={2} />
          <p className="mt-2">{t('privacyNote')}</p>
        </div>
        <div className="flex items-center gap-3 px-2">
          <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-full bg-ink text-sm font-extrabold text-white">
            {t('nav.analystInitials')}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{t('nav.analystRole')}</span>
            <span className="truncate text-xs text-muted">{t('nav.analystOrg')}</span>
          </span>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
