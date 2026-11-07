import { CircleCheck } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import CounsellorPage from '@/components/counsellor/CounsellorPage';
import { LiveRefresh } from '@/components/realtime/LiveRefresh';
import { routing } from '@/i18n/routing';
import { changeCutoffHours, loadMyBookings, loadMyOffers } from '@/lib/booking/server';
import { careView } from '@/lib/care/display';
import { loadCareFacts } from '@/lib/care/tracker';
import { loadDirectory } from '@/lib/directory/server';
import { createClient, getAuthUser } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/counsellor'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'counsellor') : {};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Counsellor & Referral (task 15, sections 2 and 4): verified professionals
 * who are accepting patients, booking on their real free times, the
 * patient's own bookings (live for both sides), offers on their open
 * requests, and the referral path. Also confirms a request sent from Ask
 * GeneBridge (?request=…), read as the owner (RLS).
 */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/counsellor'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { request: requestParam, topic, with: withParam } = await searchParams;

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  const [tDashboard, format, facts, path, profile] = await Promise.all([
    getTranslations({ locale, namespace: 'dashboard' }),
    getFormatter({ locale }),
    loadCareFacts(supabase),
    loadUserPath(supabase),
    user ? supabase.from('profiles').select('locale').eq('user_id', user.id).maybeSingle() : null,
  ]);
  const language = profile?.data?.locale ?? locale;
  const [entries, bookings, offers, cutoffHours] = await Promise.all([
    loadDirectory(supabase, { language, path }),
    loadMyBookings(supabase),
    loadMyOffers(supabase),
    changeCutoffHours(supabase),
  ]);

  // The referral path: the care journey without "Result understood" (task 07).
  const steps = careView(facts, tDashboard as unknown as Parameters<typeof careView>[1], format)
    .steps.filter((s) => s.key !== 'understood')
    .map(({ title, meta, status }) => ({ title, meta, status }));

  let requestId: string | null = null;
  let banner = null;
  if (typeof requestParam === 'string' && UUID.test(requestParam)) {
    const { data } = await supabase
      .from('counsellor_requests')
      .select('id, reason, urgency, share_summary, status')
      .eq('id', requestParam)
      .maybeSingle();
    if (data) {
      if (data.status === 'open') requestId = data.id;
      const t = await getTranslations({ locale, namespace: 'assistant' });
      banner = (
        <section role="status" className="mx-auto mt-8 flex max-w-xl flex-col gap-2 rounded-card border border-line bg-surface p-5 shadow-card" data-testid="request-confirmation">
          <div className="flex items-center gap-2">
            <CircleCheck aria-hidden="true" className="size-5 text-unaffected" />
            <h2 className="text-lg font-extrabold">{t('counsellorRequest.title')}</h2>
          </div>
          <p className="text-sm">{t('counsellorRequest.reason', { topic: t(`escalation.topics.${data.reason}` as 'escalation.topics.pregnancy') })}</p>
          {data.urgency === 'priority' ? <p className="text-sm font-semibold">{t('counsellorRequest.priority')}</p> : null}
          <p className="text-sm text-muted">{data.share_summary ? t('counsellorRequest.summaryShared') : t('counsellorRequest.noSummary')}</p>
          <p className="text-sm">{t('counsellorRequest.body')}</p>
        </section>
      );
    }
  }

  return (
    <>
      {user ? (
        <LiveRefresh
          channel={`patient-bookings-${user.id}`}
          watch={[
            { table: 'bookings', filter: `patient_id=eq.${user.id}` },
            { table: 'notifications', filter: `user_id=eq.${user.id}` },
          ]}
        />
      ) : null}
      {banner}
      <CounsellorPage
        entries={entries}
        bookings={bookings}
        cutoffHours={cutoffHours}
        offers={offers}
        path={steps}
        familyTopic={topic === 'family'}
        requestId={requestId}
        initialProfessionalId={typeof withParam === 'string' && UUID.test(withParam) ? withParam : null}
      />
    </>
  );
}
