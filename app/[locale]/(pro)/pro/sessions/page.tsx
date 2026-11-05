import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { PROGRAMME_TIME_ZONE, todaysSessions } from '@/lib/pro/queue';
import { loadRequests, requireCounsellorPage } from '@/lib/pro/server';
import { JoinButton } from '../components/JoinButton';
import { PageHeader } from '../components/PageHeader';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/sessions'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro' });
  return { title: `${t('sessions.title')} · ${t('meta.title')}`, robots: { index: false } };
}

/** Today's bookings in time order, with join buttons. */
export default async function SessionsPage({ params }: PageProps<'/[locale]/pro/sessions'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, t, format] = await Promise.all([
    requireCounsellorPage(),
    getTranslations({ locale, namespace: 'pro' }),
    getFormatter({ locale }),
  ]);
  const L = proLabels(t as unknown as Translate);
  const sessions = todaysSessions(await loadRequests(supabase), new Date());

  return (
    <>
      <PageHeader title={t('sessions.title')} subtitle={t('sessions.subtitle')} />
      {sessions.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-muted shadow-card">{t('sessions.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <span className="min-w-16 text-xl font-extrabold tabular-nums">
                {format.dateTime(new Date(s.booking!.startsAt), {
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                  timeZone: PROGRAMME_TIME_ZONE,
                })}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{L.request(s)}</span>
                <span className="text-sm text-muted">
                  {t(s.isCouple ? 'detail.coupleSession' : 'detail.individualSession')} ·{' '}
                  {t(`detail.formats.${s.booking!.format}`)} · {t(`status.${s.status}`)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <Link href={`/pro?request=${s.id}`} className="text-sm font-semibold text-brand-text underline">
                  {t('sessions.open')}
                </Link>
                {s.booking!.attendedAt ? (
                  <span className="rounded-full bg-success-tint px-3 py-1.5 text-[13px] font-bold text-success-text">
                    {t('sessions.attended')}
                  </span>
                ) : s.status !== 'closed' ? (
                  <JoinButton requestId={s.id} label={t('sessions.join')} />
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
