'use client';

import { Camera, FileText, Info, Mic, MicOff, Network, Send, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { SCAN_CONTEXT_KEY } from '@/lib/scan/assistantContext';
import { cn } from '@/lib/cn';
import { AssistantMessage, type ChatMessage, type ReplyMeta } from './AssistantMessage';
import { useSpeechInput } from './useSpeechInput';

const MAX_LENGTH = 1500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Per-session settings: cleared when the browser tab session ends. */
const KEYS = {
  conversation: 'gb_assistant_conversation',
  useResult: 'gb_assistant_use_result',
  family: 'gb_assistant_share_family',
  followed: 'gb_assistant_use_followed',
} as const;

function session(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function setSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode: settings just won't persist.
  }
}

type ErrorCode = 'rate_limited' | 'too_long' | 'not_set_up' | 'signed_out' | 'file_too_large' | 'failed';
type Pending = { message: string; display: string; mode: 'normal' | 'simpler' | 'detail'; reportText?: string; file?: { data: string; mediaType: string } };

/**
 * Ask GeneBridge chat (task 06, section 6). Used full-page at
 * /dashboard/assistant and as the compact card on the dashboard home.
 */
export function AssistantChat({
  compact = false,
  aiEnabled,
  canUseFollowed = false,
  initialQuestion,
  initialShareFamily = false,
}: {
  compact?: boolean;
  aiEnabled: boolean;
  /** The person follows conditions (task 11): offer "Use the conditions I'm following". */
  canUseFollowed?: boolean;
  /** Asked once on arrival, e.g. a suggested question from the exploring Home (?q=). */
  initialQuestion?: string;
  /**
   * Arrived from the family map's "Ask GeneBridge" (?family=1): "Use my family
   * map" starts on, and GeneBridge explains the map straight away in simple words.
   */
  initialShareFamily?: boolean;
}) {
  const t = useTranslations('assistant');
  const locale = useLocale() as 'en' | 'ar';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [useResult, setUseResult] = useState(false);
  const [shareFamily, setShareFamily] = useState(false);
  const [useFollowed, setUseFollowed] = useState(false);
  const askedInitial = useRef(false);
  /** This session's earlier conversation has loaded (or there was none), so a first question can't be overwritten. */
  const [restored, setRestored] = useState(false);
  const [explainingFamily, setExplainingFamily] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  /** A report summary from the scan flow (task 12), for this browser session only. */
  const [scanContext, setScanContext] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const toggleId = useId();
  const hintId = useId();

  const stopped = messages.some((m) => m.meta?.escalation?.kind === 'emergency');

  // Restore this session's conversation and settings.
  useEffect(() => {
    const id = session(KEYS.conversation);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only session state once on mount
    setUseResult(session(KEYS.useResult) === '1');
    if (initialShareFamily) setSession(KEYS.family, '1');
    setShareFamily(initialShareFamily || session(KEYS.family) === '1');
    setUseFollowed(session(KEYS.followed) === '1');
    setScanContext(session(SCAN_CONTEXT_KEY));
    if (!id) {
      setRestored(true);
      return;
    }
    conversationRef.current = id;
    fetch(`/api/assistant/conversation?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data: { messages: { id: string; role: 'user' | 'assistant'; content: string; meta: ReplyMeta | Record<string, never> }[] }) => {
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
            meta: m.role === 'assistant' && 'category' in m.meta ? (m.meta as ReplyMeta) : undefined,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setRestored(true));
  }, [initialShareFamily]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || messages.length === 0) return;
    // Desktop: the conversation scrolls inside itself.
    list.scrollTo({ top: list.scrollHeight });
    // Phones: the page scrolls, so bring the newest message into view too.
    if (list.scrollHeight <= list.clientHeight) list.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = useCallback(
    async (p: Pending) => {
      if (busy || stopped) return;
      setError(null);
      setBusy(true);
      const userId = `u-${Date.now()}`;
      const replyId = `a-${Date.now()}`;
      setMessages((m) => [...m, { id: userId, role: 'user', text: p.display }]);
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: conversationRef.current,
            message: p.message,
            locale,
            mode: p.mode,
            useMyResult: useResult,
            // The server reads the conditions itself; the browser only asks.
            useFollowedConditions: canUseFollowed && useFollowed,
            // The server reads the family map itself (owner-only, no names); the browser only asks.
            useFamilyMap: shareFamily,
            reportText: p.reportText ?? scanContext ?? null,
            file: p.file ?? null,
          }),
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { code?: ErrorCode };
          setError(body.code ?? 'failed');
          setMessages((m) => m.filter((x) => x.id !== userId));
          return;
        }
        setMessages((m) => [...m, { id: replyId, role: 'assistant', text: '', streaming: true }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as
              | { type: 'start'; conversationId: string }
              | { type: 'delta'; text: string }
              | { type: 'done'; reply: ReplyMeta & { id: string | null; text: string } };
            if (event.type === 'start') {
              conversationRef.current = event.conversationId;
              setSession(KEYS.conversation, event.conversationId);
            } else if (event.type === 'delta') {
              setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: x.text + event.text } : x)));
            } else {
              const { id, text, ...meta } = event.reply;
              setMessages((m) =>
                m.map((x) => (x.id === replyId ? { id: id ?? replyId, role: 'assistant', text, meta, streaming: false } : x)),
              );
            }
          }
        }
      } catch {
        setError('failed');
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, stopped, locale, useResult, shareFamily, canUseFollowed, useFollowed, scanContext],
  );

  // A suggested question from another page (?q=) is asked once, on arrival.
  // From the family map (?family=1), GeneBridge is asked to explain the map.
  useEffect(() => {
    if (!restored || askedInitial.current) return;
    const q = initialQuestion?.trim();
    if (q) {
      askedInitial.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- asks one question on arrival, once the earlier conversation has loaded
      void send({ message: q, display: q, mode: 'normal' });
      return;
    }
    if (!initialShareFamily || !shareFamily) return;
    askedInitial.current = true;
    // A refresh shouldn't ask again: drop ?family=1 from the address.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('family');
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // Harmless if it stays.
    }
    const starter = t('family.explainStarter');
    setExplainingFamily(true);
    void send({ message: starter, display: starter, mode: 'normal' }).finally(() => setExplainingFamily(false));
  }, [restored, initialQuestion, initialShareFamily, shareFamily, send, t]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (text.length > MAX_LENGTH) return setError('too_long');
    setDraft('');
    void send({ message: text, display: text, mode: 'normal' });
  }

  function rephrase(index: number, mode: 'simpler' | 'detail') {
    const question = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user');
    if (question) void send({ message: question.text, display: t(mode), mode });
  }

  function turnOnResult(on: boolean) {
    setUseResult(on);
    setSession(KEYS.useResult, on ? '1' : null);
    if (on) {
      void fetch('/api/assistant/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ai_result_toggle_on' }),
      }).catch(() => {});
    }
  }

  function toggleFollowed(on: boolean) {
    setUseFollowed(on);
    setSession(KEYS.followed, on ? '1' : null);
  }

  function toggleFamily(on: boolean) {
    setShareFamily(on);
    setSession(KEYS.family, on ? '1' : null);
  }

  async function deleteConversation() {
    if (!window.confirm(t('delete.confirm'))) return;
    const id = conversationRef.current;
    if (id) await fetch(`/api/assistant/conversation?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    conversationRef.current = null;
    setSession(KEYS.conversation, null);
    setMessages([]);
    setNotice(t('delete.done'));
    inputRef.current?.focus();
  }

  const speech = useSpeechInput(
    locale,
    useCallback((text: string) => setDraft((d) => (d ? `${d} ${text}` : text)), []),
  );

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', compact ? '' : 'lg:h-full')}>
      <p className="flex items-start gap-2 rounded-tile bg-brand-tint-soft p-3 text-[13px] leading-relaxed" data-testid="boundary-banner">
        <Info aria-hidden="true" className="mt-0.5 size-4 flex-none text-brand-text" strokeWidth={2} />
        <span>{t('boundary')}</span>
      </p>
      {!aiEnabled && !compact ? <p className="text-xs text-muted">{t('offlineNote')}</p> : null}

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('title')}
        className={cn('flex flex-col gap-4 overflow-y-auto', compact ? 'min-h-0 max-h-105' : 'min-h-[40svh] pe-1 lg:min-h-0 lg:flex-1')}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted">{t('suggestions.label')}</p>
            <div className="flex flex-wrap gap-2">
              {t.raw('suggestions.items').map((q: string) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send({ message: q, display: q, mode: 'normal' })}
                  className="min-h-11 cursor-pointer rounded-full border border-line-strong bg-surface px-4 text-start text-[13px] font-semibold hover:bg-brand-tint-soft"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end motion-safe:animate-msg-in">
              <p className="max-w-prose rounded-2xl rounded-se-sm bg-ink px-4 py-3 text-[15px] font-medium whitespace-pre-line text-white">
                <span className="sr-only">{t('you')}: </span>
                {m.text.split('\n\n')[0]}
              </p>
            </div>
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              compact={compact}
              onRephrase={(mode) => rephrase(i, mode)}
              onTurnOnResult={() => turnOnResult(true)}
            />
          ),
        )}
        {busy && !messages.some((m) => m.streaming) ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-1.5 rounded-full bg-muted motion-safe:animate-pulse" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
            {explainingFamily ? t('family.explaining') : t('typing')}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-input bg-affected-tint px-3 py-2 text-sm text-affected">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      ) : null}

      {/* Sharing controls, shown above the input (section 5). Off by default. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <button
            id={toggleId}
            type="button"
            role="switch"
            aria-checked={useResult}
            aria-describedby={hintId}
            onClick={() => turnOnResult(!useResult)}
            className={cn(
              'relative mt-0.5 h-7 w-12 flex-none cursor-pointer rounded-full border-2 transition-colors',
              useResult ? 'border-ink bg-ink' : 'border-line-strong bg-surface',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-0.5 size-5 rounded-full transition-[inset-inline-start]',
                useResult ? 'start-5.5 bg-white' : 'start-0.5 bg-muted',
              )}
            />
          </button>
          <div className="flex flex-col">
            <label htmlFor={toggleId} className="cursor-pointer text-sm font-bold">
              {t('toggle.label')}
            </label>
            <span id={hintId} className="text-xs text-muted">
              {t('toggle.hint')}
            </span>
          </div>
        </div>
        {canUseFollowed ? (
          <div className="flex items-start gap-3">
            <button
              id={`${toggleId}-followed`}
              type="button"
              role="switch"
              aria-checked={useFollowed}
              aria-describedby={`${hintId}-followed`}
              onClick={() => toggleFollowed(!useFollowed)}
              className={cn(
                'relative mt-0.5 h-7 w-12 flex-none cursor-pointer rounded-full border-2 transition-colors',
                useFollowed ? 'border-ink bg-ink' : 'border-line-strong bg-surface',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-0.5 size-5 rounded-full transition-[inset-inline-start]',
                  useFollowed ? 'start-5.5 bg-white' : 'start-0.5 bg-muted',
                )}
              />
            </button>
            <div className="flex flex-col">
              <label htmlFor={`${toggleId}-followed`} className="cursor-pointer text-sm font-bold">
                {t('followedToggle.label')}
              </label>
              <span id={`${hintId}-followed`} className="text-xs text-muted">
                {t('followedToggle.hint')}
              </span>
            </div>
          </div>
        ) : null}
        {!compact ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={shareFamily}
              onClick={() => toggleFamily(!shareFamily)}
              className={shareFamily ? chipOnClasses : chipClasses}
            >
              <Network aria-hidden="true" className="size-4" />
              {shareFamily ? t('family.shared') : t('family.share')}
            </button>
            <button type="button" onClick={() => setReportOpen(true)} className={chipClasses}>
              <FileText aria-hidden="true" className="size-4" />
              {t('report.button')}
            </button>
            {shareFamily ? <span className="text-xs text-muted">{t('family.hint')}</span> : null}
          </div>
        ) : null}
      </div>

      {scanContext ? (
        <div data-testid="scan-context" className="flex flex-wrap items-center gap-2 rounded-tile bg-info-tint p-3 text-[13px] font-semibold text-info-text">
          <FileText aria-hidden="true" className="size-4 flex-none" />
          <span className="flex-1">{t('scanContext.using')}</span>
          <button
            type="button"
            onClick={() => {
              setScanContext(null);
              setSession(SCAN_CONTEXT_KEY, null);
            }}
            className="min-h-11 cursor-pointer rounded-full px-3 underline underline-offset-4"
          >
            {t('scanContext.remove')}
          </button>
        </div>
      ) : null}

      {reportOpen ? (
        <ReportForm
          aiEnabled={aiEnabled}
          onCancel={() => setReportOpen(false)}
          onSubmit={(reportText, file) => {
            setReportOpen(false);
            void send({ message: t('report.question'), display: `${t('report.question')}\n\n`, mode: 'normal', reportText, file });
          }}
        />
      ) : null}

      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('input.label')}
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          value={draft}
          rows={1}
          maxLength={MAX_LENGTH}
          disabled={stopped}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          placeholder={speech.listening ? t('input.listening') : t('input.placeholder')}
          // 16px on phones: iOS Safari zooms the page when a smaller field is focused.
          className="max-h-40 min-h-12 flex-1 resize-none rounded-[24px] border border-line-strong bg-surface px-4 py-3 text-base placeholder:text-muted disabled:opacity-60 lg:text-[15px]"
        />
        {/* Task 12: photograph or upload a report; it opens the scan flow. */}
        <Link
          href="/dashboard/scan?from=assistant"
          aria-label={t('attach')}
          title={t('attach')}
          className="flex size-12 flex-none cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-brand-tint-soft"
        >
          <Camera aria-hidden="true" className="size-5" />
        </Link>
        {speech.supported ? (
          <button
            type="button"
            aria-label={speech.listening ? t('input.micStop') : t('input.mic')}
            aria-pressed={speech.listening}
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={stopped}
            className={cn(
              'flex size-12 flex-none cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-brand-tint-soft',
              speech.listening && 'border-brand bg-brand-tint',
            )}
          >
            {speech.listening ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
          </button>
        ) : null}
        <button
          type="submit"
          aria-label={t('input.send')}
          disabled={busy || stopped || !draft.trim()}
          className="flex size-12 flex-none cursor-pointer items-center justify-center rounded-full bg-brand text-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send aria-hidden="true" className="size-5 rtl:-scale-x-100" strokeWidth={2} />
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {compact ? (
          <Link href="/dashboard/assistant" className="text-sm font-semibold text-brand-text underline-offset-4 hover:underline">
            {t('openFull')}
          </Link>
        ) : (
          <span />
        )}
        {messages.length ? (
          <button type="button" onClick={deleteConversation} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
            <Trash2 aria-hidden="true" className="size-4" />
            {t('delete.button')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const chipBase = 'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold';
const chipClasses = `${chipBase} border-line-strong bg-surface hover:bg-brand-tint-soft`;
/** `cn` only joins classes, so the "on" chip gets its own colours rather than overriding chipClasses. */
const chipOnClasses = `${chipBase} border-ink bg-ink text-white`;

function ReportForm({
  aiEnabled,
  onCancel,
  onSubmit,
}: {
  aiEnabled: boolean;
  onCancel: () => void;
  onSubmit: (reportText: string, file?: { data: string; mediaType: string }) => void;
}) {
  const t = useTranslations('assistant.report');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ data: string; mediaType: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textId = useId();
  const fileId = useId();

  return (
    <section aria-label={t('title')} className="flex flex-col gap-3 rounded-tile border border-line-strong bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-extrabold">{t('title')}</h3>
        <button type="button" aria-label={t('cancel')} onClick={onCancel} className="flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-brand-tint-soft">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <label htmlFor={textId} className="text-sm font-semibold">
        {t('paste')}
      </label>
      <textarea id={textId} rows={5} value={text} onChange={(e) => setText(e.target.value.slice(0, 8000))} className="rounded-input border border-line-strong p-3 text-sm" />
      {aiEnabled ? (
        <>
          <label htmlFor={fileId} className="text-sm font-semibold">
            {t('upload')}
          </label>
          <input
            id={fileId}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setError(null);
              if (!f) return setFile(null);
              if (f.size > MAX_FILE_BYTES) return setError(t('tooBig'));
              const buffer = await f.arrayBuffer();
              let binary = '';
              const bytes = new Uint8Array(buffer);
              for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              setFile({ data: btoa(binary), mediaType: f.type, name: f.name });
            }}
            className="text-sm"
          />
          <p className="text-xs text-muted">{t('uploadNote')}</p>
        </>
      ) : (
        <p className="text-xs text-muted">{t('uploadOff')}</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-affected">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!text.trim() && !file}
          onClick={() => onSubmit(text, file ? { data: file.data, mediaType: file.mediaType } : undefined)}
          className={buttonClasses('dark', 'sm', 'disabled:opacity-50')}
        >
          {t('explain')}
        </button>
        <button type="button" onClick={onCancel} className={buttonClasses('ghost', 'sm')}>
          {t('cancel')}
        </button>
      </div>
    </section>
  );
}
