import { Bell } from 'lucide-react';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cardClasses } from '@/components/ui/Card';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../components/PageHeader';
import { MarkRead } from './MarkRead';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/notifications'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'verify.notifications' });
  return { title: t('title'), robots: { index: false } };
}

type Row = { id: string; kyc_status: string | null; created_at: string; read_at: string | null };

/** Verification status changes, newest first (task 14, section 5). */
export default async function NotificationsPage({ params }: PageProps<'/[locale]/pro/notifications'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId }, t, format] = await Promise.all([
    requireProfessionalPage(),
    getTranslations({ locale, namespace: 'verify.notifications' }),
    getFormatter({ locale }),
  ]);
  const { data } = await supabase
    .from('notifications')
    .select('id, kyc_status, created_at, read_at')
    .eq('user_id', userId)
    .eq('kind', 'kyc_status')
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {rows.some((r) => !r.read_at) ? <MarkRead /> : null}
      {rows.length === 0 ? (
        <p className="text-[15px] text-muted">{t('empty')}</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className={cn(cardClasses, 'flex items-start gap-3 p-4', !r.read_at && 'border-brand')}>
              <Bell aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" />
              <div className="flex flex-col gap-0.5">
                <p className="text-[15px] font-semibold">{t(`kinds.${r.kyc_status ?? 'pending'}` as 'kinds.pending')}</p>
                <p className="text-sm text-muted">
                  {format.dateTime(new Date(r.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
                  {!r.read_at ? ` · ${t('new')}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
