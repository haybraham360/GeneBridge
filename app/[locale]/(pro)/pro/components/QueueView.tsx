'use client';

import { ArrowLeft, Inbox } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { proLabels, type Translate } from '@/lib/pro/labels';
import {
  cardTag,
  elapsed,
  filterCounts,
  hasSessionToday,
  matchesFilter,
  PROGRAMME_TIME_ZONE,
  queueFilters,
  sortQueue,
  type QueueFilter,
} from '@/lib/pro/queue';
import type { RequestDetail as Detail, RequestRow, Service } from '@/lib/pro/types';
import { createClient } from '@/lib/supabase/browser';
import { openRequest } from '../actions';
import { RequestDetail } from './RequestDetail';

const POLL_MS = 30_000;

type Props = {
  rows: RequestRow[];
  services: Service[];
  nowIso: string;
  initialRequestId: string | null;
};

/**
 * Queue on the left, the selected request on the right. On phones the list
 * shows first and a request opens as its own view (with Back).
 *
 * Opening a request reads shared data and is logged for the patient, so it
 * happens only on an explicit choice (click, Enter or Space). Arrow keys move
 * focus through the queue without opening anything.
 */
export function QueueView({ rows, services, nowIso, initialRequestId }: Props) {
  const t = useTranslations('pro');
  const format = useFormatter();
  const router = useRouter();
  const L = useMemo(() => proLabels(t as unknown as Translate), [t]);

  const [now, setNow] = useState(() => new Date(nowIso));
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const latestOpen = useRef<string | null>(null);
  const [knownIds, setKnownIds] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const [seenRows, setSeenRows] = useState(rows);
  const listRef = useRef<HTMLUListElement>(null);

  const sorted = useMemo(() => sortQueue(rows, now), [rows, now]);
  const counts = useMemo(() => filterCounts(rows, now), [rows, now]);
  const visible = useMemo(() => sorted.filter((r) => matchesFilter(r, filter, now)), [sorted, filter, now]);

  // Keep relative times and "Today" current.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const open = useCallback(
    async (id: string, { push = true }: { push?: boolean } = {}) => {
      latestOpen.current = id;
      setSelectedId(id);
      setLoading(true);
      setLoadError(false);
      if (push) {
        const url = new URL(window.location.href);
        url.searchParams.set('request', id);
        window.history.pushState(null, '', url);
      }
      const result = await openRequest(id);
      if (latestOpen.current !== id) return;
      setLoading(false);
      if (result.ok) {
        setDetail(result.data);
        setNewIds((ids) => {
          if (!ids.has(id)) return ids;
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
        const row = rows.find((r) => r.id === id);
        if (row) setAnnouncement(t('queue.showing', { label: L.request(row) }));
      } else {
        setDetail(null);
        setLoadError(true);
      }
    },
    [rows, t, L],
  );

  const closeDetail = useCallback(({ push = true }: { push?: boolean } = {}) => {
    latestOpen.current = null;
    setSelectedId(null);
    setDetail(null);
    setLoadError(false);
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.delete('request');
      window.history.pushState(null, '', url);
    }
  }, []);

  // Deep link (?request=…): open it once, as the counsellor asked for it.
  const openedInitial = useRef(false);
  useEffect(() => {
    if (openedInitial.current || !initialRequestId) return;
    openedInitial.current = true;
    void open(initialRequestId, { push: false });
  }, [initialRequestId, open]);

  // Browser Back / Forward between the list and a request.
  useEffect(() => {
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get('request');
      if (id && id !== latestOpen.current) void open(id, { push: false });
      if (!id) closeDetail({ push: false });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, closeDetail]);

  // Live updates: Supabase realtime (RLS applies), with a slow poll as a
  // fallback. Either way the server re-reads the queue; no shared data moves.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('pro-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counsellor_requests' }, () => router.refresh())
      .subscribe();
    const poll = setInterval(() => router.refresh(), POLL_MS);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  // New requests since the page opened fade in; priority ones get "New".
  // Adjusted while rendering when the server sends a fresh list.
  if (rows !== seenRows) {
    setSeenRows(rows);
    const arrived = rows.filter((r) => !knownIds.has(r.id));
    if (arrived.length > 0) {
      setKnownIds(new Set([...knownIds, ...arrived.map((r) => r.id)]));
      setNewIds((ids) => new Set([...ids, ...arrived.map((r) => r.id)]));
      const priority = arrived.find((r) => r.urgency === 'priority');
      if (priority) setAnnouncement(t('queue.newArrived', { label: L.request(priority) }));
    }
  }

  // A request that left the queue (closed, or taken by a colleague) is no
  // longer shown, even if it was open.
  const shownId =
    selectedId && rows.some((r) => r.id === selectedId && r.status !== 'closed') ? selectedId : null;

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-queue-card]') ?? [])];
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? buttons[Math.min(buttons.length - 1, index + 1)]
        : buttons[Math.max(0, index === -1 ? 0 : index - 1)];
    next?.focus();
  };

  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: PROGRAMME_TIME_ZONE });

  const cornerText = (row: RequestRow) => {
    if (row.booking && hasSessionToday(row, now)) {
      return format.dateTime(new Date(row.booking.startsAt), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: PROGRAMME_TIME_ZONE,
      });
    }
    const { unit, value } = elapsed(row.createdAt, now);
    return t(`queue.ago.${unit}`, { value });
  };

  return (
    <>
      <div role="group" aria-label={t('queue.filtersLabel')} className="flex flex-wrap gap-2.5">
        {queueFilters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-semibold transition-colors',
              filter === f ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-brand-tint-soft',
            )}
          >
            {t(`queue.filters.${f}`, { count: counts[f] })}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label={t('queue.listLabel')}
          className={cn('min-w-0 flex-[1_1_300px] flex-col gap-2.5', shownId ? 'hidden lg:flex' : 'flex')}
        >
          <p id="queue-keys" className="sr-only">
            {t('queue.keyboardHint')}
          </p>
          {visible.length === 0 ? (
            <p className="rounded-tile border border-line bg-surface p-4 text-sm text-muted">
              {counts.all === 0 ? t('queue.emptyAll') : t('queue.empty')}
            </p>
          ) : (
            <ul
              ref={listRef}
              onKeyDown={onListKeyDown}
              aria-describedby="queue-keys"
              className="flex flex-col gap-2.5"
              data-testid="queue"
            >
              {visible.map((row) => {
                const tag = cardTag(row, now);
                const selected = row.id === shownId;
                return (
                  <li key={row.id} className="motion-safe:animate-card-in">
                    <button
                      type="button"
                      data-queue-card
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => void open(row.id)}
                      className={cn(
                        'flex w-full flex-col gap-1.5 rounded-tile bg-surface p-4 text-start transition-colors hover:bg-brand-tint-soft/60',
                        selected ? 'border-2 border-brand p-[15px]' : 'border border-line',
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <TagPill tag={tag} time={time} t={t as unknown as Translate} />
                          {newIds.has(row.id) && row.urgency === 'priority' ? (
                            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-ink">
                              {t('queue.new')}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted">{cornerText(row)}</span>
                      </span>
                      <span className="text-[15px] font-extrabold">{L.request(row)}</span>
                      <span className="text-[13px] leading-[1.45] text-muted">{L.cardLine(row)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-busy={loading}
          className={cn(
            'min-w-0 flex-[3_1_520px] flex-col gap-4',
            shownId ? 'flex' : 'hidden lg:flex',
          )}
        >
          {shownId ? (
            <button
              type="button"
              onClick={() => closeDetail()}
              className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-brand-text lg:hidden"
            >
              <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" strokeWidth={2} />
              {t('queue.back')}
            </button>
          ) : null}

          {detail && detail.id === shownId ? (
            <div key={detail.id} className="motion-safe:animate-cross-fade">
              <RequestDetail
                detail={detail}
                services={services}
                onChange={setDetail}
                onClosed={() => {
                  setAnnouncement(t('close.closed'));
                  closeDetail();
                }}
                onAnnounce={setAnnouncement}
              />
            </div>
          ) : (
            <div className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface p-8 text-center shadow-card">
              {loading ? (
                <p className="text-sm text-muted">{t('queue.loading')}</p>
              ) : loadError ? (
                <p className="text-sm text-muted">{t('queue.loadError')}</p>
              ) : (
                <>
                  <Inbox aria-hidden="true" className="size-6 text-brand-text" strokeWidth={2} />
                  <p className="font-bold">{t('queue.chooseRequest')}</p>
                  <p className="text-sm text-muted">{t('queue.chooseRequestHint')}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function TagPill({
  tag,
  time,
  t,
}: {
  tag: ReturnType<typeof cardTag>;
  time: (iso: string) => string;
  t: Translate;
}) {
  const base = 'rounded-full px-2.5 py-0.5 text-xs font-bold';
  if (tag.kind === 'priority') return <span className={cn(base, 'bg-affected-tint text-danger')}>{t('queue.tags.priority')}</span>;
  if (tag.kind === 'today')
    return <span className={cn(base, 'bg-info-tint text-info-text')}>{t('queue.tags.today', { time: time(tag.startsAt) })}</span>;
  return <span className={cn(base, 'bg-line text-ink-soft')}>{t('queue.tags.standard')}</span>;
}
