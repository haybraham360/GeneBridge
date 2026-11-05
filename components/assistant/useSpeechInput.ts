'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Minimal shape of the browser SpeechRecognition API (not in TypeScript's DOM types). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/**
 * Speak a question instead of typing it (task 06, 1b point 9). Uses the
 * browser's speech recognition; the button is hidden where it isn't
 * available. Audio is handled by the browser and never sent to GeneBridge.
 */
export function useSpeechInput(locale: 'en' | 'ar', onText: (text: string) => void) {
  const supported = useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const ref = useRef<Recognition | null>(null);

  const stop = useCallback(() => {
    ref.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = locale === 'ar' ? 'ar-AE' : 'en-GB';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    ref.current = r;
    setListening(true);
    r.start();
  }, [locale, onText]);

  useEffect(() => () => ref.current?.stop(), []);

  return { supported, listening, start, stop };
}
