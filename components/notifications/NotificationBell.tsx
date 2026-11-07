'use client';

import { Bell } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchInbox, markInboxRead } from '@/app/[locale]/inboxActions';
import { useViewerTimeZone } from '@/components/booking/useViewerTimeZone';
import { Link } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import { cn } from '@/lib/cn';
import type { InboxItem } from '@/lib/notifications/inbox';
import { createClient } from '@/lib/supabase/browser';

const KNOWN = ['new_message', 'booking_requested', 'booking_confirmed', 'booking_declined', 'booking_changed', 'booking_cancelled', 'booking_reminder', 'request_offer', 'offer_accepted'];

/**
 * The bell (task 15, section 3): new messages, bookings, changes and
 * reminders, with an unread count. Live through Supabase Realtime. Each item
 * says only what happened, never message text.
 */
export function NotificationBell({ userId, role, initial }: { userId: string; role: 'patient' | 'professional'; initial: InboxItem[] }) {
  const t = useTranslations('booking.bell');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => !i.read).length;

  const reload = useCallback(() => {
    void fetchInbox().then(setItems).catch(() => undefined);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bell-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, reload)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const href = (i: InboxItem): string => {
    if (i.kind === 'new_message') return role === 'patient' ? `/dashboard/messages${i.conversationId ? `/${i.conversationId}` : ''}` : `/pro/messages${i.conversationId ? `/${i.conversationId}` : ''}`;
    if (i.kind === 'offer_accepted') return '/pro';
    if (i.kind === 'kyc_status') return '/pro/verify';
    if (i.kind.startsWith('booking_') || i.kind === 'request_offer') return role === 'patient' ? '/dashboard/counsellor' : '/pro/sessions';
    return role === 'patient' ? '/dashboard' : '/pro';
  };
  const text = (i: InboxItem): string =>
    KNOWN.includes(i.kind)
      ? t(`kinds.${i.kind}` as 'kinds.new_message', {
          name: i.otherName ?? t('someone'),
          when: i.startsAt ? whenLabel(i.startsAt, zone, locale) : t('noTime'),
        })
      : t('kinds.other');

  const markAll = () => {
    setItems((list) => list.map((i) => ({ ...i, read: true })));
    void markInboxRead();
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `${t('label')}: ${t('unread', { count: unread })}` : t('label')}
        onClick={() => setOpen((v) => !v)}
        data-testid="notification-bell"
        className="relative flex size-11 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white shadow-card hover:bg-brand/5"
      >
        <Bell aria-hidden className="size-5" />
        {unread ? (
          <span className="absolute -end-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-ink" data-testid="bell-count">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} role="region" aria-label={t('label')} className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neutral-200 bg-white p-3 shadow-card">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-[14px] font-extrabold">{t('label')}</p>
            {unread ? (
              <button type="button" onClick={markAll} className="min-h-9 cursor-pointer text-[12px] font-bold text-[#C2410C] underline">
                {t('markAll')}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? <p className="px-1 py-3 text-[13px] text-neutral-600">{t('empty')}</p> : null}
          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {items.map((i) => (
              <li key={i.id}>
                <Link
                  href={href(i)}
                  onClick={() => {
                    setOpen(false);
                    if (!i.read) {
                      setItems((list) => list.map((x) => (x.id === i.id ? { ...x, read: true } : x)));
                      void markInboxRead([i.id]);
                    }
                  }}
                  className={cn('flex gap-2 rounded-xl px-2 py-2.5 text-[13px] text-ink no-underline hover:bg-brand/5', !i.read && 'font-bold')}
                >
                  <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.read ? 'bg-transparent' : 'bg-brand')} />
                  <span>{text(i)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
