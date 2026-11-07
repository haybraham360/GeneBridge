import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cardClasses } from '@/components/ui/Card';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { isDemoMode } from '@/lib/demo/mode';
import { demoAccounts, demoCounts, totalRows, type DemoCounts } from '@/lib/demo/purge';
import { requireAdminPage } from '@/lib/kyc/server';
import { RemoveAllDemoData } from './components/RemoveAllDemoData';
import { RemoveDemoAccount } from './components/RemoveDemoAccount';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/demo-data'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'admin.demoData' });
  return { title: t('title'), robots: { index: false } };
}

/** What the admin sees, grouped. Anything not listed counts under "other". */
const GROUPS = {
  results: ['screening_results'],
  family: ['family_members', 'family_links', 'family_member_conditions'],
  requests: ['counsellor_requests'],
  bookings: ['bookings'],
  conversations: ['conversations', 'messages'],
  notices: ['family_notifications', 'notice_sends'],
  events: ['events'],
} as const;

function grouped(counts: DemoCounts) {
  const listed = new Set<string>(Object.values(GROUPS).flat());
  const sum = (tables: readonly string[]) => tables.reduce((n, table) => n + (counts[table] ?? 0), 0);
  const other = Object.entries(counts)
    .filter(([table]) => table !== 'accounts' && !listed.has(table))
    .reduce((n, [, value]) => n + value, 0);
  return [
    ...Object.entries(GROUPS).map(([key, tables]) => ({ key, count: sum(tables) })),
    { key: 'other', count: other },
  ];
}

/**
 * Demo data (task 15, section 1): counts of demo accounts and records,
 * "Remove all demo data" (type REMOVE to confirm), and removing a demo
 * account one at a time. Every removal is audited.
 */
export default async function DemoDataPage({ params }: PageProps<'/[locale]/admin/demo-data'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { supabase } = await requireAdminPage();
  const [t, counts, accounts] = await Promise.all([
    getTranslations({ locale, namespace: 'admin.demoData' }),
    demoCounts(supabase),
    demoAccounts(supabase),
  ]);
  const empty = accounts.length === 0 && totalRows(counts) === 0;

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </header>

      <p className="text-sm font-semibold" data-testid="demo-mode">
        {isDemoMode() ? t('modeOn') : t('modeOff')}
      </p>

      <section aria-labelledby="demo-counts" className={cn(cardClasses, 'flex flex-col gap-4 p-6')}>
        <h2 id="demo-counts" className="text-lg font-extrabold">{t('counts.title')}</h2>
        {empty ? (
          <p className="text-[15px] text-muted" data-testid="demo-empty">{t('empty')}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('counts.accounts')} value={accounts.length} />
            {grouped(counts).map(({ key, count }) => (
              <Stat key={key} label={t(`counts.${key}` as 'counts.results')} value={count} />
            ))}
          </dl>
        )}
        <div className="flex flex-col items-start gap-3 border-t border-line pt-4">
          <p className="text-[15px]">{t('removeAll.intro')}</p>
          <RemoveAllDemoData disabled={empty} />
        </div>
      </section>

      {accounts.length > 0 ? (
        <section aria-labelledby="demo-accounts" className="flex flex-col gap-3">
          <h2 id="demo-accounts" className="text-lg font-extrabold">{t('accounts.title')}</h2>
          <ul className="flex flex-col gap-3">
            {accounts.map((a) => {
              const name = a.display_name || t('accounts.noName');
              return (
                <li key={a.user_id} data-testid="demo-account" className={cn(cardClasses, 'flex flex-wrap items-center gap-4 p-4')}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-bold">{name}</p>
                    <p className="text-sm text-muted">{t(`accounts.roles.${a.role}` as 'accounts.roles.individual')}</p>
                  </div>
                  <RemoveDemoAccount userId={a.user_id} name={name} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-[13px] text-muted">{t('syntheticNote')}</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-tile bg-bg p-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-2xl font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
