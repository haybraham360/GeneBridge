'use client';
/**
 * "Describe your family" (task 13, section 1). Speak or type; the tree
 * draws itself. A large round microphone button (tap to start, tap to
 * stop) with a live transcript, a text box for typing (Arabic or English),
 * and "Draw it". Speech sends itself after a pause. If the microphone is
 * blocked, typing still works.
 */
import { Lock, Mic, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { useSpeechToText, type SttLocale } from '@/lib/audio/stt';
import { cn } from '@/lib/cn';
import { MAX_DESCRIBE_CHARS } from '@/lib/family/types';
import { focusRing } from './FamilyDialogs';

export function DescribePanel({
  busy,
  progress,
  error,
  showPrivate,
  highlight = false,
  onSubmit,
}: {
  busy: boolean;
  progress: string | null;
  error: string | null;
  /** "This stays private to you", once per session. */
  showPrivate: boolean;
  /** Rings the panel when the person is pointed here ("Start describing"). */
  highlight?: boolean;
  onSubmit: (text: string, input: 'voice' | 'text') => Promise<boolean>;
}) {
  const t = useTranslations('family.describe');
  const uiLocale = useLocale() as SttLocale;
  const [speakIn, setSpeakIn] = useState<SttLocale>(uiLocale);
  const [text, setText] = useState('');
  const [fromVoice, setFromVoice] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();

  const submit = async (value: string, input: 'voice' | 'text') => {
    const clean = value.trim().slice(0, MAX_DESCRIBE_CHARS);
    if (!clean || busy) return;
    const ok = await onSubmit(clean, input);
    if (ok) {
      setText('');
      setFromVoice(false);
    }
  };

  const stt = useSpeechToText({
    locale: speakIn,
    onFinal: (heard, auto) => {
      const next = `${text ? `${text} ` : ''}${heard}`.slice(0, MAX_DESCRIBE_CHARS);
      setText(next);
      setFromVoice(true);
      if (auto) void submit(next, 'voice');
      else boxRef.current?.focus();
    },
  });

  // Microphone blocked: fall back to typing straight away.
  useEffect(() => {
    if (stt.error === 'denied') boxRef.current?.focus();
  }, [stt.error]);

  const listening = stt.state === 'listening';
  const micMessage =
    stt.error === 'denied' ? t('mic.denied') : stt.error === 'failed' ? t('mic.failed') : !stt.supported ? t('mic.unavailable') : null;

  return (
    <section id="family-describe" className={cn(cardClasses, 'scroll-mt-24 p-5', highlight && 'motion-safe:animate-attention')} aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="text-base font-extrabold tracking-[-0.02em]">
        {t('title')}
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t.rich('hint', { i: (c) => <i>{c}</i> })}</p>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => (listening ? stt.stop() : stt.start())}
          disabled={!stt.supported || busy || stt.state === 'processing'}
          aria-pressed={listening}
          aria-label={listening ? t('mic.stop') : t('mic.start')}
          data-testid="family-mic"
          className={cn(
            'relative grid size-16 shrink-0 place-items-center rounded-full bg-brand text-ink shadow-card transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50',
            focusRing,
            listening && 'ring-4 ring-brand-ring',
          )}
        >
          {listening ? <Square className="size-6" aria-hidden fill="currentColor" /> : <Mic className="size-7" aria-hidden />}
          {listening ? <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-brand motion-safe:animate-ping" /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold" id={`${ids}-speak`}>
            {t('speakIn')}
          </p>
          <div role="radiogroup" aria-labelledby={`${ids}-speak`} className="mt-1.5 flex gap-1.5">
            {(['ar', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={speakIn === l}
                lang={l}
                disabled={listening}
                onClick={() => setSpeakIn(l)}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-xs font-bold transition',
                  focusRing,
                  speakIn === l ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
                )}
              >
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div aria-live="polite" className="mt-3 min-h-5 text-xs text-muted">
        {listening ? (
          <p>
            <span className="font-semibold">{t('mic.listening')}</span>
            {stt.transcript ? (
              <span dir="auto" className="mt-1 block rounded-input bg-brand-tint-soft px-3 py-2 text-[13px] text-ink" data-testid="family-transcript">
                {stt.transcript}
              </span>
            ) : null}
          </p>
        ) : stt.state === 'processing' ? (
          <p>{t('mic.processing')}</p>
        ) : micMessage ? (
          <p role={stt.error ? 'alert' : undefined} data-testid="family-mic-message">
            {micMessage}
          </p>
        ) : null}
      </div>

      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text, fromVoice ? 'voice' : 'text');
        }}
      >
        <label htmlFor={`${ids}-text`} className="mb-1.5 block text-xs font-bold">
          {t('label')}
        </label>
        <textarea
          ref={boxRef}
          id={`${ids}-text`}
          dir="auto"
          rows={4}
          maxLength={MAX_DESCRIBE_CHARS}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit(text, fromVoice ? 'voice' : 'text');
            }
          }}
          placeholder={t('placeholder')}
          aria-describedby={`${ids}-tip ${ids}-count`}
          className={cn('w-full resize-y rounded-input border border-line-strong bg-surface px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-muted', focusRing)}
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p id={`${ids}-tip`} className="text-[11.5px] leading-relaxed text-muted">
            {t('tip')}
          </p>
          <span id={`${ids}-count`} className="shrink-0 text-[11px] text-muted tabular-nums" dir="ltr">
            {t('counter', { count: text.length, max: MAX_DESCRIBE_CHARS })}
          </span>
        </div>
        <Button type="submit" size="sm" className="mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !text.trim()}>
          {busy ? t('drawing') : t('draw')}
        </Button>
      </form>

      <div aria-live="polite" className="mt-3 space-y-2 text-xs">
        {progress ? (
          <p className="font-semibold text-brand-text" data-testid="family-progress">
            {progress}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-input bg-brand-tint-soft px-3 py-2 text-brand-text-dark">
            {error}
          </p>
        ) : null}
        {showPrivate ? (
          <p className="flex items-center gap-2 text-muted">
            <Lock className="size-3.5 shrink-0 text-brand-text" aria-hidden />
            {t('private')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
