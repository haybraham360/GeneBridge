import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { Logo } from '@/components/ui/Logo';
import { routing } from '@/i18n/routing';
import { signOut } from '@/lib/auth/actions';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'pro') : {};
}

type RequestRow = {
  id: string;
  reason: string;
  urgency: 'standard' | 'priority';
  share_summary: boolean;
  summary: string | null;
  status: 'open' | 'booked' | 'closed';
  created_at: string;
};

/**
 * Counsellor workspace (stretch). For now: the request list from Ask
 * GeneBridge (task 06). RLS shows a counsellor only open requests in their
 * facility or ones assigned to them, and only summaries people chose to
 * share. Priority requests come first.
 */
export default async function ProPage({ params }: PageProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, tTopic, tc, format] = await Promise.all([
    getTranslations({ locale, namespace: 'assistant.pro' }),
    getTranslations({ locale, namespace: 'assistant.escalation' }),
    getTranslations({ locale, namespace: 'common' }),
    getFormatter({ locale }),
  ]);

  const supabase = await createClient();
  const { data } = await supabase
    .from('counsellor_requests')
    .select('id, reason, urgency, share_summary, summary, status, created_at')
    .order('created_at', { ascending: true })
    .limit(200);
  const rows = ((data ?? []) as RequestRow[]).sort(
    (a, b) => Number(b.urgency === 'priority') - Number(a.urgency === 'priority') || a.created_at.localeCompare(b.created_at),
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-page flex-col gap-8 p-6">
      <header className="flex items-center justify-between gap-4">
        <Logo />
        <form action={signOut}>
          <button type="submit" className="min-h-11 cursor-pointer text-sm font-semibold text-brand-text underline hover:text-brand-text-dark">
            {tc('signOut')}
          </button>
        </form>
      </header>
      <main id="main" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
          <p className="text-[15px] text-muted">{t('subtitle')}</p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="request-list">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  {r.urgency === 'priority' ? (
                    <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">{tTopic('priority')}</span>
                  ) : null}
                  <span className="font-bold">{t(`reasons.${r.reason}` as 'reasons.pregnancy')}</span>
                  <span className={cn('ms-auto rounded-full border border-line px-3 py-1 text-xs font-semibold')}>
                    {t(`status.${r.status}`)}
                  </span>
                </div>
                <p className="text-sm text-muted">{t('created', { date: format.dateTime(new Date(r.created_at), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
                {r.share_summary && r.summary ? (
                  <div className="rounded-tile bg-bg p-3 text-sm">
                    <p className="mb-1 text-xs font-bold text-muted">{t('summary')}</p>
                    <p className="whitespace-pre-line">{r.summary}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t('noSummary')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
