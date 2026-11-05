import { CircleCheck } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import CounsellorPage from '@/components/counsellor/CounsellorPage';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/counsellor'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'counsellor') : {};
}

/**
 * Counsellor & Referral is a later milestone (M7). For now it confirms a
 * request sent from Ask GeneBridge (?request=…), read as the owner (RLS).
 */
export default async function Page({ params, searchParams }: PageProps<'/[locale]/dashboard/counsellor'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { request: requestId } = await searchParams;

  let banner = null;
  if (typeof requestId === 'string') {
    const supabase = await createClient();
    const { data } = await supabase
      .from('counsellor_requests')
      .select('reason, urgency, share_summary')
      .eq('id', requestId)
      .maybeSingle();
    if (data) {
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
      {banner}
      <CounsellorPage />
    </>
  );
}
