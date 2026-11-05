'use client';

import { Square, Volume2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useSpeechSupported } from '@/components/ui/ListenButton';
import { buttonClasses } from '@/components/ui/Button';
import { speak, stopSpeaking } from '@/lib/audio/speak';

/**
 * The design's "Listen" pill. Reads the main card and the three cards in the
 * page language. The only part of the notice page that needs JavaScript, so
 * it isn't rendered until the browser can speak.
 */
export function NoticeListen({ text }: { text: string }) {
  const t = useTranslations('notice.listen');
  const locale = useLocale();
  const supported = useSpeechSupported();
  const [speaking, setSpeaking] = useState(false);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stopSpeaking(), []);

  if (!supported) return null;

  const toggle = () => {
    if (speaking) {
      stop.current?.();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    stop.current = speak(text, locale === 'ar' ? 'ar' : 'en', { onEnd: () => setSpeaking(false) });
  };

  const Icon = speaking ? Square : Volume2;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className={buttonClasses('ghost', 'md', 'min-h-[52px]')}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
      {speaking ? t('stop') : t('play')}
    </button>
  );
}
