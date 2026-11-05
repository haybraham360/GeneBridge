import { Search } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { latestPerPatient, matchesSearch } from '@/lib/pro/queue';
import { loadRequests, requireCounsellorPage } from '@/lib/pro/server';
import { PageHeader } from '../components/PageHeader';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/patients'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro' });
  return { title: `${t('patients.title')} · ${t('meta.title')}`, robots: { index: false } };
}

/**
 * Patients this counsellor has seen, with their latest request. Search
 * matches only first names that couples chose to share.
 */
export default async function PatientsPage({ params, searchParams }: PageProps<'/[locale]/pro/patients'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, t, format, query] = await Promise.all([
    requireCounsellorPage(),
    getTranslations({ locale, namespace: 'pro' }),
    getFormatter({ locale }),
    searchParams,
  ]);
  const L = proLabels(t as unknown as Translate);
  const q = typeof query.q === 'string' ? query.q.slice(0, 60) : '';
  const all = latestPerPatient(await loadRequests(supabase));
  const rows = all.filter((r) => matchesSearch(r, q));

  return (
    <>
      <PageHeader title={t('patients.title')} subtitle={t('patients.subtitle')} />
      <form role="search" className="flex flex-wrap items-end gap-2.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="patient-search" className="text-sm font-bold">
            {t('patients.searchLabel')}
          </label>
          <input
            id="patient-search"
            name="q"
            type="search"
            defaultValue={q}
            aria-describedby="patient-search-hint"
            className="min-h-11 w-72 max-w-full rounded-input border border-line-strong bg-surface px-3.5 text-[15px]"
          />
        </div>
        <button type="submit" className={buttonClasses('dark', 'sm')}>
          <Search aria-hidden="true" className="size-4" strokeWidth={2} />
          {t('patients.search')}
        </button>
        {q ? (
          <Link href="/pro/patients" className={buttonClasses('ghost', 'sm')}>
            {t('patients.clear')}
          </Link>
        ) : null}
        <p id="patient-search-hint" className="w-full text-[13px] text-muted">
          {t('patients.searchHint')}
        </p>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-muted shadow-card">
          {q ? t('patients.noMatch', { query: q }) : t('patients.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="w-full min-w-140 border-collapse text-start text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('patients.columns.patient')}</th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('patients.columns.request')}</th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('patients.columns.status')}</th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('patients.columns.date')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <th scope="row" className="px-5 py-3.5 text-start font-bold">
                    {r.status === 'closed' ? (
                      L.request(r)
                    ) : (
                      <Link href={`/pro?request=${r.id}`} className="text-ink underline-offset-4 hover:underline">
                        {L.request(r)}
                      </Link>
                    )}
                  </th>
                  <td className="px-5 py-3.5 text-muted">{L.cardLine(r)}</td>
                  <td className="px-5 py-3.5">
                    {r.status === 'closed' && r.outcome
                      ? t('patients.closedWith', { outcome: t(`close.outcomes.${r.outcome}`) })
                      : t(`status.${r.status}`)}
                  </td>
                  <td className="px-5 py-3.5 text-muted">
                    {format.dateTime(new Date(r.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
