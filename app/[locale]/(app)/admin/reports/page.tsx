import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/lib/kyc/server';
import { ReportRow } from './ReportRow';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/reports'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'chat.admin' });
  return { title: t('title'), robots: { index: false } };
}

/** Reported messages (guardrail 17): the list holds no text; opening one shows that message only, audited. */
export default async function ReportsPage({ params }: PageProps<'/[locale]/admin/reports'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase }, t, format] = await Promise.all([requireAdminPage(), getTranslations({ locale, namespace: 'chat.admin' }), getFormatter({ locale })]);
  const { data } = await supabase.rpc('admin_message_reports');
  const rows = (data ?? []) as { id: string; reason: string; status: string; created_at: string }[];
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[15px] text-muted">{t('subtitle')}</p>
      </header>
      {rows.length === 0 ? <p className="text-[15px] text-muted">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <ReportRow key={r.id} id={r.id} reason={r.reason} status={r.status} when={format.dateTime(new Date(r.created_at), { dateStyle: 'medium', timeStyle: 'short' })} />
        ))}
      </ul>
    </>
  );
}
