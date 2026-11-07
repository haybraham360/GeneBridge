'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useViewerTimeZone } from '@/components/booking/useViewerTimeZone';
import { Link } from '@/i18n/navigation';
import { whenLabel } from '@/lib/booking/time';
import type { Conversation } from '@/lib/chat/types';
import { initialsOf } from '@/lib/directory/sort';
import { cn } from '@/lib/cn';

/** Conversations, newest first, with unread counts (task 15, section 3). */
export function ConversationList({ conversations, base, activeId }: { conversations: Conversation[]; base: '/dashboard/messages' | '/pro/messages'; activeId?: string }) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const zone = useViewerTimeZone();
  return (
    <ul className="flex flex-col gap-2" data-testid="conversation-list">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            href={`${base}/${c.id}`}
            aria-current={c.id === activeId ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-2xl bg-white p-4 text-ink no-underline shadow-card hover:bg-brand/5', c.id === activeId && 'ring-2 ring-brand')}
          >
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FFE2D2] text-[15px] font-bold text-[#9A3412]">
              {initialsOf(c.otherName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-[15px]', c.unread ? 'font-extrabold' : 'font-bold')}>{c.otherName}</span>
              <span className="block truncate text-[12px] text-neutral-500">
                {c.lastMessageAt ? whenLabel(c.lastMessageAt, zone, locale) : ''}
                {c.myRole === 'patient' && !c.professionalAvailable ? ` · ${t('unavailable')}` : ''}
              </span>
            </span>
            {c.unread ? (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-extrabold text-ink" aria-label={t('unread', { count: c.unread })} data-testid="unread-count">
                {c.unread}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
