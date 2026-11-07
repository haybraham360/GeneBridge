import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConversationList } from '@/components/chat/ConversationList';
import { LiveRefresh } from '@/components/realtime/LiveRefresh';
import { routing } from '@/i18n/routing';
import { loadConversations } from '@/lib/chat/server';
import { requireProfessionalPage } from '@/lib/kyc/server';
import { PageHeader } from '../../components/PageHeader';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/messages'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'chat' });
  return { title: t('title'), robots: { index: false } };
}

/** Messages for professionals (task 15, section 3). Locked until verified (the workspace layout and RLS). */
export default async function ProMessagesPage({ params }: PageProps<'/[locale]/pro/messages'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId }, t] = await Promise.all([requireProfessionalPage(), getTranslations({ locale, namespace: 'chat' })]);
  const conversations = await loadConversations(supabase);
  return (
    <>
      <LiveRefresh channel={`pro-conversations-${userId}`} watch={[{ table: 'notifications', filter: `user_id=eq.${userId}` }]} />
      <PageHeader title={t('title')} subtitle={t('subtitleProfessional')} />
      {conversations.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-muted shadow-card" data-testid="conversations-empty">{t('empty')}</p>
      ) : (
        <ConversationList conversations={conversations} base="/pro/messages" />
      )}
    </>
  );
}
