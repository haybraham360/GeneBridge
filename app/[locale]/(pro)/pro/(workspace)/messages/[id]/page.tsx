import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChatView } from '@/components/chat/ChatView';
import { SharedPanel } from '@/components/chat/SharedPanel';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { loadConversations, loadMessages } from '@/lib/chat/server';
import type { ChatShareItem } from '@/lib/chat/types';
import { requireProfessionalPage } from '@/lib/kyc/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/pro/messages/[id]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'chat' });
  return { title: t('title'), robots: { index: false } };
}

/** One conversation, professional side, with what the patient shared beside it. */
export default async function ProConversationPage({ params }: PageProps<'/[locale]/pro/messages/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ supabase, userId }, t] = await Promise.all([requireProfessionalPage(), getTranslations({ locale, namespace: 'chat' })]);
  const conversation = (await loadConversations(supabase)).find((c) => c.id === id && c.myRole === 'professional');
  if (!conversation) {
    return (
      <>
        <Link href="/pro/messages" className="text-sm font-bold text-brand-text underline">{t('back')}</Link>
        <p className="rounded-card border border-line bg-surface p-6 shadow-card">{t('notFound')}</p>
      </>
    );
  }
  const [messages, { data: grants }] = await Promise.all([
    loadMessages(supabase, id),
    supabase.rpc('pro_shared_in_conversation', { p_conversation: id }),
  ]);
  return (
    <>
      <Link href="/pro/messages" className="text-sm font-bold text-brand-text underline">{t('back')}</Link>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <ChatView conversation={conversation} initialMessages={messages} userId={userId} />
        <SharedPanel conversationId={id} grants={((grants ?? []) as { resource: ChatShareItem; level: string }[]).map((g) => ({ resource: g.resource, level: g.level }))} />
      </div>
    </>
  );
}
