import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { loadMyNotes, loadRequests, requireCounsellorPage } from '@/lib/pro/server';
import { PageHeader } from '../components/PageHeader';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/notes'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro' });
  return { title: `${t('notes.title')} · ${t('meta.title')}`, robots: { index: false } };
}

/** The counsellor's own notes, newest first, linked to their request. */
export default async function NotesPage({ params }: PageProps<'/[locale]/pro/notes'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, me }, t, format] = await Promise.all([
    requireCounsellorPage(),
    getTranslations({ locale, namespace: 'pro' }),
    getFormatter({ locale }),
  ]);
  const L = proLabels(t as unknown as Translate);
  const [notes, requests] = await Promise.all([loadMyNotes(supabase, me.counsellorId), loadRequests(supabase)]);
  const byId = new Map(requests.map((r) => [r.id, r]));

  return (
    <>
      <PageHeader title={t('notes.title')} subtitle={t('notes.subtitle')} />
      {notes.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-muted shadow-card">{t('notes.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => {
            const request = byId.get(n.requestId);
            return (
              <li key={n.requestId} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-extrabold">{request ? L.request(request) : t('notes.unknownRequest')}</h2>
                  <span className="text-xs text-muted">
                    {t('notes.updated', {
                      date: format.dateTime(new Date(n.updatedAt), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                    })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line">{n.body.trim() || t('notes.emptyNote')}</p>
                {request && request.status !== 'closed' ? (
                  <Link href={`/pro?request=${n.requestId}`} className="self-start text-sm font-semibold text-brand-text underline">
                    {t('notes.open')}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
