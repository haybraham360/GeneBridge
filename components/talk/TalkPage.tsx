'use client';

import { Square, Volume2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechSupported } from '@/components/ui/ListenButton';
import { buttonClasses } from '@/components/ui/Button';
import { speak, stopSpeaking } from '@/lib/audio/tts';
import { guideListenText, starterFor, type Guide, type GuideId, type Recipient } from '@/lib/talk/guides';
import { FeelingsCheckin } from './FeelingsCheckin';
import { GuidePanel, GuideTabs } from './GuidePanel';
import { MessageDrafter, type DrafterHandle } from './MessageDrafter';
import { copyText, sendTalkEvent } from './talkClient';

type Props = {
  guides: Guide[];
  initialGuide: GuideId;
  partnerName: string | null;
  savedDraft: { recipient: Recipient; body: string } | null;
  supportLine: string;
  aiChecks: boolean;
};

/**
 * Talking to your partner and family (design/source/Talk.dc.html): guide
 * tabs, the selected guide, and beside it the feelings check-in and the
 * message drafter. On phones everything stacks in that order. Nothing
 * here pressures anyone, and nothing is sent on the person's behalf.
 */
export function TalkPage({ guides, initialGuide, partnerName, savedDraft, supportLine, aiChecks }: Props) {
  const t = useTranslations('talk');
  const locale = useLocale();
  const supported = useSpeechSupported();
  const [selected, setSelected] = useState<GuideId>(initialGuide);
  const [speaking, setSpeaking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const drafter = useRef<DrafterHandle>(null);

  const guide = guides.find((g) => g.id === selected) ?? guides[0];

  const stopReading = useCallback(() => {
    stop.current?.();
    stop.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  // One view event per guide shown, including the first.
  useEffect(() => {
    sendTalkEvent({ name: 'talk_guide_viewed', guide: selected });
  }, [selected]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const select = (id: GuideId) => {
    if (id === selected) return;
    stopReading();
    setSelected(id);
    // Keep the guide in the URL without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set('guide', id);
    window.history.replaceState(null, '', url);
    const next = guides.find((g) => g.id === id);
    if (next) drafter.current?.presetFor(id, next.recipient, starterFor(next, partnerName));
  };

  const listen = () => {
    if (speaking) return stopReading();
    setSpeaking(true);
    stop.current = speak(guideListenText(guide), locale === 'ar' ? 'ar' : 'en', { onEnd: () => setSpeaking(false) });
  };

  const copyPhrase = async (phrase: string) => {
    if (!(await copyText(phrase))) return;
    setToast(t('toast.copied'));
    sendTalkEvent({ name: 'talk_phrase_copied', guide: selected });
  };

  const initial = guides.find((g) => g.id === initialGuide) ?? guides[0];

  return (
    <div className="flex min-w-0 flex-col gap-6 px-[clamp(16px,3vw,40px)] pt-8 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{t('header.title')}</h1>
          <p className="text-[15px] text-muted">{t('header.subtitle')}</p>
        </div>
        {supported ? (
          <button
            type="button"
            onClick={listen}
            aria-pressed={speaking}
            aria-label={speaking ? t('header.stopLabel') : t('header.listenLabel')}
            className={buttonClasses('ghost', 'md')}
          >
            {speaking ? (
              <Square aria-hidden="true" className="size-5" strokeWidth={2} />
            ) : (
              <Volume2 aria-hidden="true" className="size-5" strokeWidth={2} />
            )}
            {speaking ? t('header.stop') : t('header.listen')}
          </button>
        ) : null}
      </header>

      <GuideTabs guides={guides} selected={selected} onSelect={select} />

      <div className="flex flex-wrap items-start gap-5">
        <GuidePanel guide={guide} onCopyPhrase={copyPhrase} onUsePhrase={(phrase) => drafter.current?.usePhrase(phrase)} />
        <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <FeelingsCheckin supportLine={supportLine} />
          <MessageDrafter
            ref={drafter}
            guide={selected}
            initialRecipient={initial.recipient}
            initialText={starterFor(initial, partnerName)}
            saved={savedDraft}
            aiChecks={aiChecks}
            onToast={setToast}
          />
        </aside>
      </div>

      {/* Always mounted, so screen readers announce each new toast. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        {toast ? (
          <span className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</span>
        ) : null}
      </div>
    </div>
  );
}
