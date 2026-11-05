'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { saveNote } from '../actions';

const SAVE_AFTER_MS = 1500;
const RETRY_MS = 5000;

type State = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Private session note. Saves a moment after typing stops (and on blur), with
 * a "Saved" indicator. Patients never see these notes.
 */
export function SessionNote({ requestId, initialBody }: { requestId: string; initialBody: string }) {
  const t = useTranslations('pro.detail.note');
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
        <span role="status" aria-live="polite" className="text-[13px] text-muted" data-testid="note-status">
          {state === 'saving' ? t('saving') : state === 'saved' ? t('saved') : state === 'error' ? t('error') : ''}
        </span>
      </div>
      <textarea
        id={`note-${requestId}`}
        rows={3}
        value={body}
        placeholder={t('placeholder')}
        maxLength={20000}
        onChange={(e) => {
          latest.current = e.target.value;
          setBody(e.target.value);
          setState('idle');
          schedule(SAVE_AFTER_MS);
        }}
        onBlur={() => void save()}
        className="w-full resize-y rounded-input border border-line-strong px-3.5 py-3 text-[15px] placeholder:text-muted focus-visible:border-ink"
      />
    </div>
  );
}
