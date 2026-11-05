import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { routing } from '@/i18n/routing';
import PrivacyPage from '@/components/privacy/PrivacyPage';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/privacy'>) {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? placeholderMetadata(locale, 'privacy') : {};
}

type LogRow = { id: string; viewer_name: string | null; resource: string; level: string | null; viewed_at: string };

export default async function Page({ params }: PageProps<'/[locale]/dashboard/privacy'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Guardrail 10: every read of the patient's shared data, by whom and when.
  const supabase = await createClient();
  const [{ data }, t, format] = await Promise.all([
    supabase.rpc('my_access_log'),
    getTranslations({ locale, namespace: 'dashboard.privacy' }),
    getFormatter({ locale }),
  ]);
  const tt = t as unknown as (key: string, values?: Record<string, string>) => string;
  const accessLog = ((data ?? []) as LogRow[]).map((row) => ({
    text: tt('accessLogLine', {
      name: row.viewer_name ?? '',
      resource: tt(`resources.${row.resource === 'result' && row.level === 'full' ? 'resultFull' : row.resource}`),
    }),
    when: format.dateTime(new Date(row.viewed_at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  }));

  return <PrivacyPage accessLog={accessLog} accessLogEmpty={t('accessLogEmpty')} />;
}
