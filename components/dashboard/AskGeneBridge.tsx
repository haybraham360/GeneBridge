import { Info } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { aiEnabled } from '@/lib/assistant/claude';

/** The "Ask GeneBridge" card on the dashboard home: the real chat, compact. */
export default async function AskGeneBridge() {
  const t = await getTranslations('assistant');
  return (
    <section aria-labelledby="ask-genebridge-title" className="flex flex-col gap-3 rounded-2xl bg-white px-4 pt-4.5 pb-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ask-genebridge-title" className="text-[20px] leading-none font-extrabold text-ink">
          {t('title')}
        </h2>
        <span className="flex items-center gap-1.25 text-[13px] text-muted">
          <Info aria-hidden="true" className="h-4 w-4" strokeWidth={1.6} />
          {t('cardBadge')}
        </span>
      </div>
      <AssistantChat compact aiEnabled={aiEnabled()} />
    </section>
  );
}
