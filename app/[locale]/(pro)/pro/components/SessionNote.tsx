'use client';

import { Mic, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useSpeechToText } from '@/lib/audio/stt';
import { cn } from '@/lib/cn';
import { saveNote } from '../actions';

const SAVE_AFTER_MS = 1500;
const RETRY_MS = 5000;

type State = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Private session note. Saves a moment after typing stops (and on blur), with
 * a "Saved" indicator. Patients never see these notes.
 *
 * "Speak notes" (task 16) adds what the counsellor says to the end of the
 * note. Audio is transcribed once and never stored (lib/audio/stt.ts); the
 * transcript lives only in this note.
 */
export function SessionNote({
  requestId,
  initialBody,
  onBodyChange,
}: {
  requestId: string;
  initialBody: string;
  /** The current text, for the copilot summary. */
  onBodyChange?: (body: string) => void;
}) {
  const t = useTranslations('pro.detail.note');
  const locale = useLocale() === 'en' ? 'en' : 'ar';
  const [body, setBody] = useState(initialBody);
  const [state, setState] = useState<State>('idle');
  const savedBody = useRef(initialBody);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initialBody);

  const save = async () => {
    if (timer.current) clearTimeout(timer.current);
    const text = latest.current;
    if (text === savedBody.current) return;
    setState('saving');
    const result = await saveNote({ requestId, body: text });
    if (result.ok) {
      savedBody.current = text;
      // Typing may have continued while saving.
      setState(latest.current === text ? 'saved' : 'idle');
      if (latest.current !== text) schedule(SAVE_AFTER_MS);
    } else {
      setState('error');
      schedule(RETRY_MS);
    }
  };

  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), ms);
  };

  const update = (text: string) => {
    latest.current = text;
    setBody(text);
    onBodyChange?.(text);
    setState('idle');
    schedule(SAVE_AFTER_MS);
  };

  const speech = useSpeechToText({
    locale,
    onFinal: (spoken) => {
      const before = latest.current.trimEnd();
      update(before ? `${before}\n${spoken}` : spoken);
    },
  });
  const listening = speech.state === 'listening';

  // Save anything pending when switching requests or leaving the page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current !== savedBody.current) void saveNote({ requestId, body: latest.current });
    },
    [requestId],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`note-${requestId}`} className="font-extrabold">
          {t('label')}
        </label>
        <div className="flex items-center gap-3">
          <span role="status" aria-live="polite" className="text-[13px] text-muted" data-testid="note-status">
            {speech.state === 'processing'
              ? t('transcribing')
              : state === 'saving'
                ? t('saving')
                : state === 'saved'
                  ? t('saved')
                  : state === 'error'
                    ? t('error')
                    : ''}
          </span>
          {speech.supported ? (
            <button
              type="button"
              onClick={listening ? speech.stop : speech.start}
              disabled={speech.state === 'processing'}
              aria-pressed={listening}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold',
                listening ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:bg-brand-tint-soft',
              )}
            >
              {listening ? (
                <Square aria-hidden="true" className="size-4" strokeWidth={2} />
              ) : (
                <Mic aria-hidden="true" className="size-4" strokeWidth={2} />
              )}
              {listening ? t('stopSpeaking') : t('speak')}
            </button>
          ) : null}
        </div>
      </div>
      {listening && speech.transcript ? (
        <p aria-live="polite" className="rounded-xl bg-bg px-3.5 py-2.5 text-sm text-muted">
          {speech.transcript}
        </p>
      ) : null}
      {speech.error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {t(speech.error === 'denied' ? 'micDenied' : 'micFailed')}
        </p>
      ) : null}
      <textarea
        id={`note-${requestId}`}
        rows={3}
        value={body}
        placeholder={t('placeholder')}
        maxLength={20000}
        onChange={(e) => update(e.target.value)}
        onBlur={() => void save()}
        className="w-full resize-y rounded-input border border-line-strong px-3.5 py-3 text-[15px] placeholder:text-muted focus-visible:border-ink"
      />
    </div>
  );
}
