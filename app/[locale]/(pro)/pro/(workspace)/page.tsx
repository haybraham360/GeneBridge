import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { loadRequests, loadSpecialistServices, requireCounsellorPage } from '@/lib/pro/server';
import { QueueView } from '../components/QueueView';
import { AcceptingToggle } from '../components/AcceptingToggle';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { OpenRequestsPanel } from '@/components/booking/OpenRequestsPanel';
import { loadOpenRequests } from '@/lib/booking/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro.meta' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * The queue (task 07, section 4). Lists requests the counsellor can see,
 * without any shared data: opening a request (and logging that access)
 * happens only when the counsellor chooses one.
 */
export default async function QueuePage({ params, searchParams }: PageProps<'/[locale]/pro'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [{ supabase }, pro, t, query] = await Promise.all([
    requireCounsellorPage(),
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'pro.queue' }),
    searchParams,
  ]);
  const [rows, services, openRequests] = await Promise.all([loadRequests(supabase), loadSpecialistServices(supabase), loadOpenRequests(supabase)]);
  const requested = typeof query.request === 'string' ? query.request : null;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
          <p className="text-[15px] text-muted">{t('subtitle')}</p>
        </div>
        <AcceptingToggle initial={pro.profile.acceptingPatients} />
      </header>
      <OpenRequestsPanel requests={openRequests} accepting={pro.profile.acceptingPatients} />
      <QueueView
        rows={rows}
        services={services}
        nowIso={new Date().toISOString()}
        initialRequestId={rows.some((r) => r.id === requested) ? requested : null}
      />
    </>
  );
}
