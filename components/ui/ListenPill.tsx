'use client';

import { Square, Volume2 } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useSpeechSupported } from '@/components/ui/ListenButton';
import { speak, stopSpeaking } from '@/lib/audio/tts';

/** The "Listen" pill from the page headers. Hidden where the browser can't speak. */
export function ListenPill({ text, play, stop, label }: { text: string; play: string; stop: string; label?: string }) {
  const locale = useLocale();
  const supported = useSpeechSupported();
  const [speaking, setSpeaking] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => stopSpeaking(), []);
  if (!supported) return null;
  const toggle = () => {
    if (speaking) {
      cancel.current?.();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    cancel.current = speak(text, locale === 'ar' ? 'ar' : 'en', { onEnd: () => setSpeaking(false) });
  };
  const Icon = speaking ? Square : Volume2;
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking} aria-label={label} className={buttonClasses('ghost', 'md')}>
      <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
      {speaking ? stop : play}
    </button>
  );
}
