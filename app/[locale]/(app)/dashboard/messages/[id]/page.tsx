import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChatView } from '@/components/chat/ChatView';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { loadConversations, loadMessages } from '@/lib/chat/server';
import { createClient, getAuthUser } from '@/lib/supabase/server';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/messages/[id]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'chat' });
  return { title: t('title'), robots: { index: false } };
}

/** One conversation, patient side (task 15, section 3). */
export default async function ConversationPage({ params }: PageProps<'/[locale]/dashboard/messages/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const supabase = await createClient();
  const [user, t, conversations] = await Promise.all([getAuthUser(supabase), getTranslations({ locale, namespace: 'chat' }), loadConversations(supabase)]);
  const conversation = conversations.find((c) => c.id === id && c.myRole === 'patient');

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pb-10 pt-7 sm:pt-9">
      <Link href="/dashboard/messages" className="text-[13px] font-bold text-[#C2410C] underline">{t('back')}</Link>
      <div className="mt-4">
        {conversation && user ? (
          <ChatView conversation={conversation} initialMessages={await loadMessages(supabase, id)} userId={user.id} />
        ) : (
          <p className="rounded-2xl bg-white p-5 text-[14px] shadow-card">{t('notFound')}</p>
        )}
      </div>
    </div>
  );
}
