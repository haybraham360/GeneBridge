import { Info, MessageSquare } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { aiEnabled } from '@/lib/assistant/claude';

/** The "Ask GeneBridge" card on the dashboard home: the real chat, compact. */
export default async function AskGeneBridge({ canUseFollowed = false }: { canUseFollowed?: boolean }) {
  const t = await getTranslations('assistant');
  return (
    <section
      aria-labelledby="ask-genebridge-title"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="ask-genebridge-title" className="flex items-center gap-2.5 text-[20px] leading-none font-extrabold tracking-[-0.01em] text-ink">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-ink text-white">
            <MessageSquare className="size-4" strokeWidth={2} />
          </span>
          {t('title')}
        </h2>
        <span className="flex items-center gap-1.25 rounded-full bg-bg px-2.5 py-1 text-[12.5px] text-muted">
          <Info aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          {t('cardBadge')}
        </span>
      </div>
      <AssistantChat compact aiEnabled={aiEnabled()} canUseFollowed={canUseFollowed} />
    </section>
  );
}
