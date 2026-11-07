import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { loadFlaggedBookings, loadProfessionals, loadQueue, requireAdminPage } from '@/lib/kyc/server';
import { SuspendButton } from './components/SuspendButton';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/verifications'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'admin.queue' });
  return { title: t('title'), robots: { index: false } };
}

/** Pending submissions (oldest first), verified professionals, and bookings to rehome. */
export default async function VerificationsPage({ params, searchParams }: PageProps<'/[locale]/admin/verifications'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, query, t, tl, format] = await Promise.all([
    requireAdminPage(),
    searchParams,
    getTranslations({ locale, namespace: 'admin' }),
    getTranslations({ locale, namespace: 'proOnboarding.labels' }),
    getFormatter({ locale }),
  ]);
  const tab = query.tab === 'professionals' || query.tab === 'bookings' ? query.tab : 'queue';

  if (tab === 'professionals') {
    const rows = await loadProfessionals(supabase);
    return (
      <>
        <Header title={t('professionals.title')} subtitle={t('professionals.subtitle')} />
        {rows.length === 0 ? (
          <p className="text-[15px] text-muted">{t('professionals.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.user_id} data-testid="professional-row" className={cn(cardClasses, 'flex flex-wrap items-center gap-4 p-4')}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-bold">{r.display_name}</p>
                  <p className="text-sm text-muted">
                    {r.profession ? tl(`profession.${r.profession}`) : ''} · <bdi dir="ltr">{r.licence_number}</bdi>
                    {r.licence_authority ? ` · ${tl(`authority.${r.licence_authority}`)}` : ''}
                    {r.licence_expiry ? ` · ${t('professionals.expires', { date: new Date(r.licence_expiry) })}` : ''}
                  </p>
                </div>
                <span className="rounded-full border border-line px-3 py-1 text-[13px] font-semibold">{tl(`status.${r.verification_status}`)}</span>
                {r.verification_status !== 'suspended' ? <SuspendButton userId={r.user_id} name={r.display_name} /> : null}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  if (tab === 'bookings') {
    const rows = await loadFlaggedBookings(supabase);
    return (
      <>
        <Header title={t('bookings.title')} subtitle={t('bookings.subtitle')} />
        {rows.length === 0 ? (
          <p className="text-[15px] text-muted">{t('bookings.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((b) => (
              <li key={b.id} className={cn(cardClasses, 'flex flex-wrap items-center justify-between gap-3 p-4 text-[15px]')}>
                <span className="font-bold">{b.professional_name}</span>
                <span>{format.dateTime(new Date(b.starts_at), { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="rounded-full border border-line px-3 py-1 text-[13px] font-semibold">{t(`bookings.reasons.${b.flag_reason}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const rows = await loadQueue(supabase);
  return (
    <>
      <Header title={t('queue.title')} subtitle={t('queue.subtitle')} />
      {rows.length === 0 ? (
        <p className="text-[15px] text-muted">{t('queue.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/verifications/${r.id}`}
                data-testid="queue-row"
                className={cn(cardClasses, 'flex flex-wrap items-center gap-4 p-4 no-underline hover:border-brand')}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="font-bold text-ink">{r.display_name || t('queue.noName')}</p>
                  <p className="text-sm text-muted">
                    {r.profession ? tl(`profession.${r.profession}`) : ''} · {tl(`authority.${r.entered_authority}`)} ·{' '}
                    {format.relativeTime(new Date(r.created_at))}
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink-soft">
                  {r.precheck_status === 'completed'
                    ? t('queue.precheck', r.precheck_counts)
                    : t(`queue.precheckStatus.${r.precheck_status}`)}
                </p>
                {r.status === 'in_review' ? (
                  <span className="rounded-full bg-info-tint px-3 py-1 text-[13px] font-semibold text-info-text">{t('queue.inReview')}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
      <p className="text-[15px] text-muted">{subtitle}</p>
    </header>
  );
}
