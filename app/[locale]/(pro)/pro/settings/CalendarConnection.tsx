'use client';

import { CalendarCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { disconnectGoogle } from '../bookingActions';

type Status = 'connected' | 'cancelled' | 'error' | 'not_configured' | 'disconnected';

/** "Connect Google Calendar" (task 15, section 5). */
export function CalendarConnection({ configured, email, connected, status: initialStatus }: { configured: boolean; email: string | null; connected: boolean; status: Status | null }) {
  const t = useTranslations('booking.calendar');
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [pending, startTransition] = useTransition();

  return (
    <section className={cn(cardClasses, 'flex max-w-2xl flex-col gap-3 p-[clamp(20px,3vw,32px)]')} aria-labelledby="calendar-title" data-testid="calendar-connection">
      <h2 id="calendar-title" className="flex items-center gap-2 text-lg font-extrabold">
        <CalendarCheck aria-hidden className="size-5 text-brand-text" /> {t('title')}
      </h2>
      <p className="text-[15px] text-muted">{t('body')}</p>
      {!configured ? (
        <p className="text-sm font-semibold">{t('notConfigured')}</p>
      ) : connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[15px] font-semibold text-success-text">{email ? t('connected', { email }) : t('connectedNoEmail')}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await disconnectGoogle().catch(() => ({ status: 'error' as const }));
                setStatus(result.status === 'ok' ? 'disconnected' : 'error');
                router.refresh();
              })
            }
            className={buttonClasses('ghost', 'sm')}
          >
            {t('disconnect')}
          </button>
        </div>
      ) : (
        // A full page load: the route redirects to Google.
        <a href={`/api/calendar/google/start?locale=${locale}`} className={buttonClasses('dark', 'md', 'self-start')}>
          {t('connect')}
        </a>
      )}
      <p role="status" aria-live="polite" className={cn('text-sm font-semibold', status === 'connected' || status === 'disconnected' ? 'text-success-text' : 'text-danger')}>
        {status ? t(`status.${status}`) : ''}
      </p>
    </section>
  );
}
