import { createClient } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { routing } from '@/i18n/routing';
import { aiEnabled } from '@/lib/assistant/claude';

export async function generateMetadata({ params }: PageProps<'/[locale]/dashboard/assistant'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'assistant.meta' });
  return { title: `${t('title')} · GeneBridge` };
}

// Rendered per request so switching AI mode on (ANTHROPIC_API_KEY) needs no rebuild.
export const dynamic = 'force-dynamic';

/** Ask GeneBridge, full page (task 06). */
export default async function AssistantPage({ params, searchParams }: PageProps<'/[locale]/dashboard/assistant'>) {
  const { locale } = await params;
  const { q, family } = await searchParams;
  const path = await loadUserPath(await createClient());
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'assistant' });

  return (
    // From 1024px the chat fills the screen and only the conversation scrolls.
    // On phones the page scrolls instead: locking it to the screen height
    // left the conversation a few pixels tall under the banner and controls.
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-[clamp(16px,3vw,40px)] pt-8 pb-6 lg:h-full">
      <header className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('title')}</h1>
        <p className="text-[15px] text-muted">{t('page.subtitle')}</p>
      </header>
      <div className="flex flex-col rounded-card border border-line bg-surface p-5 shadow-card lg:min-h-0 lg:flex-1">
        <AssistantChat
          aiEnabled={aiEnabled()}
          canUseFollowed={path.followed.length > 0}
          initialQuestion={typeof q === 'string' ? q.slice(0, 500) : undefined}
          initialShareFamily={family === '1'}
        />
      </div>
    </div>
  );
}
