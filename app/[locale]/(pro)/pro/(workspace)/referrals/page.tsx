import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { loadReferrals, requireCounsellorPage } from '@/lib/pro/server';
import { PageHeader } from '../../components/PageHeader';
import { ReferralStatusSelect } from '../../components/ReferralStatusSelect';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/referrals'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'pro' });
  return { title: `${t('referrals.title')} · ${t('meta.title')}`, robots: { index: false } };
}

/** Referrals this counsellor created; status changes reach the patient's tracker. */
export default async function ReferralsPage({ params }: PageProps<'/[locale]/pro/referrals'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, t, format] = await Promise.all([
    requireCounsellorPage(),
    getTranslations({ locale, namespace: 'pro' }),
    getFormatter({ locale }),
  ]);
  const tt = t as unknown as Translate;
  const L = proLabels(tt);
  const referrals = await loadReferrals(supabase);

  return (
    <>
      <PageHeader title={t('referrals.title')} subtitle={t('referrals.subtitle')} />
      {referrals.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-muted shadow-card">{t('referrals.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="w-full min-w-140 border-collapse text-start text-sm" data-testid="referrals">
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('referrals.columns.patient')}</th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('referrals.columns.referral')}</th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('referrals.columns.status')}</th>
                <th scope="col" className="px-5 py-3 text-start font-semibold">{t('referrals.columns.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => {
                const name = L.person(r.label);
                return (
                  <tr key={r.id} className="border-t border-line align-top">
                    <th scope="row" className="px-5 py-3.5 text-start font-bold">{name}</th>
                    <td className="px-5 py-3.5">
                      <span className="block">{tt(`detail.steps.${r.step}`)}</span>
                      {r.serviceName ? (
                        <span className="block text-muted">
                          {r.serviceKind ? `${tt(`specialist.kinds.${r.serviceKind}`)} · ` : ''}
                          {r.serviceName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <ReferralStatusSelect
                        referralId={r.id}
                        status={r.status}
                        label={t('referrals.statusLabel', { name })}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {format.dateTime(new Date(r.updatedAt), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
