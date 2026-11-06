import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ResultsView, type FindingView } from '@/components/results/ResultsView';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { logEvents } from '@/lib/auth/events';
import { conditionEntry } from '@/lib/conditions/catalogue';
import { loadMyReport } from '@/lib/results/report';
import { createClient, getAuthUser } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/results'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'results.meta' });
  return { title: t('title') };
}

function Notice({ title, body, cta, href }: { title: string; body: string; cta: string; href: string }) {
  return (
    <main className="min-w-0 flex-1 px-[clamp(16px,3vw,40px)] pt-9 pb-10">
      <section data-testid="results-notice" className="flex max-w-2xl flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-extrabold tracking-[-0.01em]">{title}</h1>
        <p className="text-[15px] leading-[1.6] text-muted">{body}</p>
        <Link href={href} className={buttonClasses('dark', 'md', 'self-start')}>
          {cta}
        </Link>
      </section>
    </main>
  );
}

/**
 * Your results, explained (task 10). Everything comes from the person's own
 * report and the condition catalogue. A flagged finding means the counsellor
 * handoff only: no explanation and no numbers (guardrail 4).
 */
export default async function ResultsPage({ params }: PageProps<'/[locale]/dashboard/results'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const supabase = await createClient();
  const [t, tc, format, report] = await Promise.all([
    getTranslations({ locale, namespace: 'results' }),
    getTranslations({ locale, namespace: 'conditions' }),
    getFormatter({ locale }),
    loadMyReport(supabase),
  ]);

  if (report.state === 'missing') {
    return <Notice title={t('missing.title')} body={t('missing.body')} cta={t('missing.cta')} href="/dashboard?addResult=1" />;
  }
  if (report.state === 'flagged') {
    return <Notice title={t('flagged.title')} body={t('flagged.body')} cta={t('flagged.cta')} href="/dashboard/counsellor" />;
  }

  const user = await getAuthUser(supabase);
  if (user) await logEvents(supabase, user.id, [{ name: 'result_viewed' }]);

  const findings: FindingView[] = report.findings.flatMap((f) => {
    const entry = conditionEntry(f.conditionId, locale);
    if (!entry) return [];
    return [
      {
        id: entry.id,
        status: f.status,
        title: entry.title,
        pattern: tc(`patterns.${entry.inheritance ?? 'complex'}`),
        gene: entry.gene ?? null,
        geneLabel: entry.gene ? tc('gene', { gene: entry.gene }) : null,
        carrierLabel: entry.carrier_label ?? entry.title,
        diseaseLabel: entry.disease_label ?? entry.title,
        carrierShort: entry.carrier_short ?? '',
        diseaseShort: entry.disease_short ?? '',
        explanation: entry.carrier_meaning ?? entry.summary,
        simple: entry.card_summary ?? entry.summary,
        unverified: f.unverified,
      },
    ];
  });

  const centre = report.centre ?? '[Screening centre]';
  const subtitle = report.reportedAt
    ? t('subtitle', { date: format.dateTime(new Date(report.reportedAt), { day: 'numeric', month: 'short', year: 'numeric' }), centre })
    : t('subtitleNoDate', { centre });

  return <ResultsView subtitle={subtitle} screenedCount={report.screenedCount} findings={findings} unverified={report.unverified} />;
}
