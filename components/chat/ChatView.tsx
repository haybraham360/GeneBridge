'use client';

import { Flag, Lock, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { deleteMessage, markRead, reportMessage, sendMessage, setBlocked, shareInChat } from '@/app/[locale]/chatActions';
import { useViewerTimeZone } from '@/components/booking/useViewerTimeZone';
import { Link, useRouter } from '@/i18n/navigation';
import { dayLabel, timeLabel } from '@/lib/booking/time';
import { canSend, chatShareItems, MESSAGE_MAX, reportReasons, upsertMessage, type ChatMessage, type ChatShareItem, type Conversation, type ReportReason } from '@/lib/chat/types';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/browser';

type Row = { id: string; sender_id: string; kind: string; body: string; created_at: string; read_at: string | null; deleted_at: string | null };
const fromRow = (r: Row): ChatMessage => ({
  id: r.id,
  senderId: r.sender_id,
  kind: r.kind === 'system' ? 'system' : 'text',
  body: r.deleted_at ? '' : r.body,
  createdAt: r.created_at,
  readAt: r.read_at,
  deletedAt: r.deleted_at,
});

/**
 * One conversation (task 15, section 3), for either side. Live through
 * Supabase Realtime (row-level security applies): messages, "Seen" and a
 * typing indicator. Guardrail 17: the text stays between the two people.
 */
export function ChatView({ conversation: c, initialMessages, userId }: { conversation: Conversation; initialMessages: ChatMessage[]; userId: string }) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const lastTyping = useRef(0);
  const writable = canSend(c);
  const isPatient = c.myRole === 'patient';

  // Live messages, read receipts and the typing indicator.
  useEffect(() => {
    const supabase = createClient();
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    const db = supabase
      .channel(`conversation-${c.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${c.id}` }, (payload) => {
        const m = fromRow(payload.new as Row);
        setMessages((list) => upsertMessage(list, m));
        if (m.senderId !== userId) {
          setTyping(false);
          if (m.kind === 'text') setAnnounce(t('newMessage', { name: c.otherName }));
          if (document.visibilityState === 'visible') void markRead(c.id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${c.id}` }, (payload) => {
        setMessages((list) => upsertMessage(list, fromRow(payload.new as Row)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${c.id}` }, () => router.refresh())
      .subscribe();
    // Typing: a broadcast with the sender's role only, never text.
    const live = supabase
      .channel(`typing-${c.id}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if ((payload as { from?: string })?.from === userId) return;
        setTyping(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => setTyping(false), 4000);
      })
      .subscribe();
    typingChannel.current = live;
    void markRead(c.id);
    return () => {
      clearTimeout(typingTimer);
      void supabase.removeChannel(db);
      void supabase.removeChannel(live);
    };
  }, [c.id, c.otherName, userId, router, t]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const onType = (value: string) => {
    setDraft(value);
    const now = Date.now();
    if (now - lastTyping.current > 2000 && typingChannel.current) {
      lastTyping.current = now;
      void typingChannel.current.send({ type: 'broadcast', event: 'typing', payload: { from: userId } });
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || text.length > MESSAGE_MAX || pending) return;
    startTransition(async () => {
      const result = await sendMessage(c.id, text).catch(() => ({ status: 'error' as const }));
      if ('message' in result) {
        setMessages((list) => upsertMessage(list, result.message));
        setDraft('');
        setError(null);
      } else {
        setError(t('sendError'));
      }
      // Focus stays in the message box after sending.
      input.current?.focus();
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const share = (item: ChatShareItem) =>
    startTransition(async () => {
      const result = await shareInChat(c.id, item);
      setNotice(result.status === 'ok' ? t('share.done') : t('sendError'));
    });

  const lastMineIndex = messages.map((m) => m.senderId === userId && m.kind === 'text').lastIndexOf(true);
  const who = (m: ChatMessage) => (m.senderId === userId ? t('you') : c.otherName);

  return (
    <div className="flex min-h-[70vh] flex-col rounded-2xl bg-white shadow-card" data-testid="chat-view">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-extrabold text-ink">{c.otherName}</h1>
          <p className="text-[12px] text-neutral-600" data-testid="privacy-line">
            {isPatient ? t('privacyLine', { name: c.otherName }) : t('privacyLinePro', { name: c.otherName })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPatient && writable ? (
            <Link href={`/dashboard/counsellor?with=${c.otherId}`} className="inline-flex min-h-11 items-center rounded-full border border-neutral-300 px-4 text-[13px] font-bold text-ink no-underline hover:bg-brand/5">
              {t('book')}
            </Link>
          ) : null}
          {c.status === 'blocked' && c.blockedByMe ? (
            <button type="button" disabled={pending} onClick={() => startTransition(async () => void (await setBlocked(c.id, false)))} className="min-h-11 cursor-pointer rounded-full border border-neutral-300 px-4 text-[13px] font-bold">
              {t('block.unblock')}
            </button>
          ) : c.status === 'active' ? (
            <button type="button" onClick={() => setConfirmBlock(true)} className="min-h-11 cursor-pointer rounded-full border border-red-600 px-4 text-[13px] font-bold text-red-700">
              {t('block.button')}
            </button>
          ) : null}
        </div>
      </header>

      {confirmBlock ? (
        <div role="alertdialog" aria-label={t('block.button')} className="flex flex-wrap items-center gap-2 bg-neutral-50 px-5 py-3 text-[13px]">
          <span className="flex-1">{t('block.confirm', { name: c.otherName })}</span>
          <button type="button" className="min-h-11 cursor-pointer rounded-full bg-red-700 px-4 font-bold text-white" onClick={() => startTransition(async () => { await setBlocked(c.id, true); setConfirmBlock(false); })}>
            {t('block.yes')}
          </button>
          <button type="button" className="min-h-11 cursor-pointer rounded-full border border-neutral-300 px-4 font-bold" onClick={() => setConfirmBlock(false)}>
            {t('block.no')}
          </button>
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 px-5 pt-3 text-[11px] text-neutral-500">
        <Lock aria-hidden className="size-3" /> {t('aiNote')}
      </p>

      <ol className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4" aria-label={t('title')} data-testid="messages">
        {messages.map((m, i) => {
          const mine = m.senderId === userId;
          const showDay = i === 0 || dayLabel(messages[i - 1].createdAt, zone, locale) !== dayLabel(m.createdAt, zone, locale);
          return (
            <li key={m.id} className="flex animate-msg-in flex-col">
              {showDay ? <p className="my-2 self-center text-[11px] font-semibold text-neutral-500">{dayLabel(m.createdAt, zone, locale)}</p> : null}
              {m.kind === 'system' ? (
                <p className="self-center rounded-full bg-[#E7F6EC] px-3 py-1 text-[12px] font-semibold text-[#166534]" data-testid="system-message">
                  {(['shared:result', 'shared:values_summary', 'shared:family_map'] as const).includes(m.body as 'shared:result')
                    ? t(`system.${m.body as 'shared:result'}`, { who: who(m) })
                    : null}
                </p>
              ) : (
                <div className={cn('group flex max-w-[80%] flex-col gap-0.5', mine ? 'self-end items-end' : 'self-start items-start')}>
                  <div
                    dir="auto"
                    data-testid={mine ? 'message-mine' : 'message-theirs'}
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14px] leading-5',
                      m.deletedAt ? 'italic text-neutral-500 ring-1 ring-neutral-200' : mine ? 'bg-ink text-white' : 'bg-[#FFF1E7] text-ink',
                    )}
                  >
                    {m.deletedAt ? t('deleted') : m.body}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <span dir="ltr">{timeLabel(m.createdAt, zone, locale)}</span>
                    {mine && i === lastMineIndex && !m.deletedAt ? <span data-testid="receipt">{m.readAt ? t('seen') : t('sent')}</span> : null}
                    {mine && !m.deletedAt ? (
                      <button type="button" aria-label={t('delete')} onClick={() => startTransition(async () => void (await deleteMessage(m.id)))} className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center opacity-60 hover:opacity-100 focus-visible:opacity-100">
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    ) : null}
                    {!mine && !m.deletedAt ? (
                      <button type="button" aria-label={t('report.aria')} onClick={() => setReporting(m.id)} className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center opacity-60 hover:opacity-100 focus-visible:opacity-100">
                        <Flag aria-hidden className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {reporting === m.id ? <ReportForm messageId={m.id} onDone={(text) => { setReporting(null); if (text) setNotice(text); }} /> : null}
                </div>
              )}
            </li>
          );
        })}
        <div ref={end} />
      </ol>

      {/* New messages are announced politely to screen readers. */}
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      {typing ? <p className="px-5 text-[12px] italic text-neutral-500" aria-live="polite">{t('typing', { name: c.otherName })}</p> : null}
      {notice ? <p role="status" className="px-5 pb-1 text-[12px] font-semibold text-[#166534]">{notice}</p> : null}

      {!writable ? (
        <div className="border-t border-neutral-100 px-5 py-4 text-[13px]" data-testid="read-only">
          {isPatient && !c.professionalAvailable ? (
            <p className="font-semibold text-red-700">
              {t('unavailable')}{' '}
              <Link href="/dashboard/counsellor" className="underline">{t('chooseAnother')}</Link>
            </p>
          ) : (
            <p className="text-neutral-700">{c.blockedByMe ? t('block.blockedByMe') : t('block.blockedByOther')}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-neutral-100 px-5 py-4">
          {isPatient ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => share('result')} data-testid="share-result" className="min-h-11 cursor-pointer rounded-full bg-[#FFEDE2] px-4 text-[13px] font-bold text-[#9A3412]">
                {t('share.button')}
              </button>
              <details className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-full border border-neutral-300 px-4 text-[13px] font-bold">{t('share.more')}</summary>
                <div className="absolute bottom-12 z-10 flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-2 shadow-card">
                  {chatShareItems.filter((s) => s !== 'result').map((s) => (
                    <button key={s} type="button" onClick={() => share(s)} className="min-h-11 cursor-pointer rounded-lg px-3 text-start text-[13px] hover:bg-brand/5">
                      {t(`share.${s}`)}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor={`message-${c.id}`} className="sr-only">{t('label', { name: c.otherName })}</label>
            <textarea
              id={`message-${c.id}`}
              ref={input}
              value={draft}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={MESSAGE_MAX}
              dir="auto"
              placeholder={t('placeholder')}
              data-testid="message-input"
              className="min-h-12 flex-1 resize-y rounded-input border border-neutral-300 bg-white px-3 py-2.5 text-[15px] focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
            />
            <button type="submit" disabled={!draft.trim() || pending} data-testid="send-message" className="min-h-12 cursor-pointer rounded-full bg-brand px-5 text-[14px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? t('sending') : t('send')}
            </button>
          </form>
          {draft.length > MESSAGE_MAX - 200 ? <p className="text-[11px] text-neutral-500">{draft.length} / {MESSAGE_MAX}</p> : null}
          {error ? <p role="alert" className="text-[12px] font-semibold text-red-700">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function ReportForm({ messageId, onDone }: { messageId: string; onDone: (notice: string | null) => void }) {
  const t = useTranslations('chat.report');
  const [reason, setReason] = useState<ReportReason>('inappropriate');
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-1 flex w-72 max-w-full flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 text-[13px] shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await reportMessage(messageId, reason);
          onDone(result.status === 'ok' ? t('done') : null);
        });
      }}
    >
      <p className="font-bold">{t('title')}</p>
      <p className="text-[12px] text-neutral-600">{t('body')}</p>
      <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} aria-label={t('title')} className="min-h-11 rounded-input border border-neutral-300 px-2">
        {reportReasons.map((r) => (
          <option key={r} value={r}>{t(`reasons.${r}`)}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-11 cursor-pointer rounded-full bg-ink px-4 font-bold text-white">{t('send')}</button>
        <button type="button" onClick={() => onDone(null)} className="min-h-11 cursor-pointer rounded-full border border-neutral-300 px-4 font-bold">{t('cancel')}</button>
      </div>
    </form>
  );
}
