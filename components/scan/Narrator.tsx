'use client';

import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { narrate, type Narration } from '@/lib/audio/tts';
import type { ScanLocale } from '@/lib/scan/types';

/** Keeps gene symbols and variant codes left to right inside Arabic text. */
export function WithLtr({ text }: { text: string }) {
  const parts = text.split(/(\b[A-Z][A-Z0-9]{1,}(?:[/,][A-Z0-9]+)*\b|c\.[^\s،,]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <bdi key={i} dir="ltr">
            {part}
          </bdi>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

type Props = {
  sentences: string[];
  locale: ScanLocale;
  autoPlay: boolean;
  onPlayed: () => void;
};

/**
 * Reads the explanation aloud (task 12, section 6) with captions: the
 * sentence being read is highlighted. Play/pause and replay. Uses the cloud
 * voice when one is set up, otherwise the browser's own.
 */
export function Narrator({ sentences, locale, autoPlay, onPlayed }: Props) {
  const t = useTranslations('scan.explain');
  const audio = useRef<HTMLAudioElement>(null);
  const narration = useRef<Narration | null>(null);
  const autoPlayed = useRef(false);
  const played = useRef(onPlayed);
  const text = useRef(sentences);
  useEffect(() => {
    played.current = onPlayed;
    text.current = sentences;
  }, [onPlayed, sentences]);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [current, setCurrent] = useState<number | null>(null);

  const play = useCallback(() => {
    narration.current?.stop();
    setState('playing');
    setCurrent(null);
    played.current();
    narration.current = narrate(text.current, locale, {
      audio: audio.current,
      onSentence: setCurrent,
      onEnd: () => {
        setState('idle');
        setCurrent(null);
      },
    });
  }, [locale]);

  // Listen and "read and listen" learners hear it straight away.
  useEffect(() => {
    if (!autoPlay || autoPlayed.current) return;
    const timer = setTimeout(() => {
      autoPlayed.current = true;
      play();
    }, 300);
    return () => clearTimeout(timer);
  }, [autoPlay, play]);

  // Stops when the narrator goes away. New text (e.g. "Read it simpler")
  // remounts it: the parent keys it by what it reads.
  useEffect(() => () => narration.current?.stop(), []);

  const toggle = () => {
    if (state === 'playing') {
      narration.current?.pause();
      setState('paused');
    } else if (state === 'paused') {
      narration.current?.resume();
      setState('playing');
    } else {
      play();
    }
  };

  return (
    <section aria-labelledby="captions-title" className="flex flex-col gap-3" data-testid="narrator">
      <div className="flex flex-wrap items-center gap-3">
        {state === 'idle' && current === null ? (
          <button type="button" onClick={play} className={buttonClasses('primary', 'lg')} data-testid="listen">
            <Volume2 aria-hidden="true" className="size-5" strokeWidth={2} />
            {t('listen')}
          </button>
        ) : (
          <button type="button" onClick={toggle} aria-pressed={state === 'playing'} className={buttonClasses('primary', 'lg')}>
            {state === 'playing' ? <Pause aria-hidden="true" className="size-5" strokeWidth={2} /> : <Play aria-hidden="true" className="size-5" strokeWidth={2} />}
            {state === 'playing' ? t('pause') : t('play')}
          </button>
        )}
        <button type="button" onClick={play} className={buttonClasses('ghost', 'lg')}>
          <RotateCcw aria-hidden="true" className="size-5" strokeWidth={2} />
          {t('replay')}
        </button>
      </div>
      {/* Cloud audio plays here; the lang attribute names the explanation language. */}
      <audio ref={audio} lang={locale} data-testid="scan-audio" className="hidden" preload="none" />
      <h2 id="captions-title" className="sr-only">
        {t('captions')}
      </h2>
      <ol
        lang={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        data-testid="captions"
        // Shown while reading aloud; the same text is on the page otherwise.
        hidden={state === 'idle'}
        className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-tile bg-bg p-4 text-[15px] leading-[1.6]"
      >
        {sentences.map((s, i) => (
          <li
            key={i}
            aria-current={i === current ? 'true' : undefined}
            className={cn('rounded-lg px-2 py-0.5', i === current ? 'bg-brand-tint font-semibold text-ink' : 'text-ink-soft')}
          >
            <WithLtr text={s} />
          </li>
        ))}
      </ol>
    </section>
  );
}
