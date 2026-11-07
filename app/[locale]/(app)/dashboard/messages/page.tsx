import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConversationList } from '@/components/chat/ConversationList';
import { StartConversation } from '@/components/chat/StartConversation';
import { LiveRefresh } from '@/components/realtime/LiveRefresh';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { loadConversations } from '@/lib/chat/server';
import { createClient, getAuthUser } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/messages'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'chat' });
  return { title: t('title'), robots: { index: false } };
}

/** Messages for patients (task 15, section 3). ?with=<professional> opens that conversation. */
export default async function MessagesPage({ params, searchParams }: PageProps<'/[locale]/dashboard/messages'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { with: withParam } = await searchParams;
  const supabase = await createClient();
  const [user, t, conversations] = await Promise.all([getAuthUser(supabase), getTranslations({ locale, namespace: 'chat' }), loadConversations(supabase)]);

  return (
    <div className="min-w-0 px-[clamp(16px,3vw,40px)] pb-10 pt-7 sm:pt-9">
      {user ? (
        <LiveRefresh channel={`patient-conversations-${user.id}`} watch={[{ table: 'notifications', filter: `user_id=eq.${user.id}` }]} />
      ) : null}
      <header className="mb-5">
        <h1 className="text-[32px] font-extrabold leading-8.5 tracking-[-0.01em] text-ink">{t('title')}</h1>
        <p className="mt-2 text-[15px] text-neutral-500">{t('subtitlePatient')}</p>
      </header>
      {typeof withParam === 'string' && UUID.test(withParam) ? <StartConversation professionalId={withParam} /> : null}
      {conversations.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-[14px] text-neutral-700 shadow-card" data-testid="conversations-empty">
          {t('emptyPatient')}{' '}
          <Link href="/dashboard/counsellor" className="font-bold text-[#C2410C] underline">{t('findProfessional')}</Link>
        </p>
      ) : (
        <ConversationList conversations={conversations} base="/dashboard/messages" />
      )}
    </div>
  );
}
