'use client';

import { CircleAlert, LifeBuoy, Phone, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { emergencyNumber, supportResources } from '@/config/support-resources';
import type { EscalationTrigger } from '@/lib/assistant/types';
import { cn } from '@/lib/cn';

/** Sends the counsellor request; returns its id or null. */
async function createRequest(body: {
  reason: EscalationTrigger;
  urgency: 'standard' | 'priority';
  shareSummary: boolean;
  summary: string | null;
}): Promise<string | null> {
  const res = await fetch('/api/assistant/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/**
 * "Talk to a genetic counsellor" card (task 06, section 4). Static: no
 * animation around escalation. The summary checkbox is off by default, and
 * the user sees and can edit the summary before anything is sent.
 */
export function EscalationCard({
  trigger,
  urgency,
  defaultSummary,
}: {
  trigger: EscalationTrigger;
  urgency: 'standard' | 'priority';
  defaultSummary?: string | null;
}) {
  const t = useTranslations('assistant.escalation');
  const router = useRouter();
  const [share, setShare] = useState(false);
  const [summary, setSummary] = useState(defaultSummary ?? t('summaryDefault', { topic: t(`topics.${trigger}`) }));
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const checkboxId = useId();
  const summaryId = useId();

  async function book() {
    setState('sending');
    const id = await createRequest({ reason: trigger, urgency, shareSummary: share, summary: share ? summary : null });
    if (!id) return setState('failed');
    setState('sent');
    router.push(`/dashboard/counsellor?request=${encodeURIComponent(id)}`);
  }

  return (
    <section
      aria-label={t('title')}
      className="flex flex-col gap-3 rounded-tile border border-brand-ring bg-brand-tint-soft p-4"
      data-testid="escalation-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CircleAlert aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
        <h3 className="text-[15px] font-extrabold">{t('title')}</h3>
        {urgency === 'priority' ? (
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{t('priority')}</span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed">{t('body')}</p>

      <div className="flex items-start gap-2.5">
        <input
          id={checkboxId}
          type="checkbox"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
          className="mt-0.5 size-5 flex-none cursor-pointer accent-ink"
        />
        <label htmlFor={checkboxId} className="cursor-pointer text-sm">
          {t('share')}
        </label>
      </div>
      {share ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={summaryId} className="text-xs font-bold text-muted">
            {t('summaryLabel')}
          </label>
          <textarea
            id={summaryId}
            value={summary}
            onChange={(e) => setSummary(e.target.value.slice(0, 2000))}
            rows={4}
            className="rounded-input border border-line-strong bg-surface p-3 text-sm"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={book}
          disabled={state === 'sending' || state === 'sent'}
          className={buttonClasses('dark', 'sm', 'disabled:cursor-wait disabled:opacity-70')}
        >
          {state === 'sending' ? t('booking') : t('book')}
        </button>
        <p role="status" className="text-sm text-muted">
          {state === 'sent' ? t('sent') : state === 'failed' ? t('failed') : t('openChat')}
        </p>
      </div>
    </section>
  );
}

/** Distress: warmth first, support numbers, and an optional counsellor. */
export function SupportCard() {
  const t = useTranslations('assistant.support');
  const tEsc = useTranslations('assistant.escalation');
  const [state, setState] = useState<'idle' | 'sent' | 'failed'>('idle');
  return (
    <section aria-label={t('title')} className="flex flex-col gap-3 rounded-tile border border-line-strong bg-surface p-4" data-testid="support-card">
      <div className="flex items-center gap-2">
        <LifeBuoy aria-hidden="true" className="size-5 text-brand-text" strokeWidth={2} />
        <h3 className="text-[15px] font-extrabold">{t('title')}</h3>
      </div>
      <p className="text-sm">{t('body')}</p>
      <ul className="flex flex-col gap-1.5">
        {supportResources.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>{t(`resources.${r.labelKey}`)}</span>
            <span dir="ltr" className="font-bold tabular-nums">
              {r.phone}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={state === 'sent'}
          onClick={async () => setState((await createRequest({ reason: 'distress', urgency: 'priority', shareSummary: false, summary: null })) ? 'sent' : 'failed')}
          className={buttonClasses('ghost', 'sm')}
        >
          {t('counsellor')}
        </button>
        <p role="status" className="text-sm text-muted">
          {state === 'sent' ? tEsc('sent') : state === 'failed' ? tEsc('failed') : ''}
        </p>
      </div>
    </section>
  );
}

/** Emergency: call now. The chat stops after this. */
export function EmergencyCard() {
  const t = useTranslations('assistant.emergency');
  const callable = /^\+?\d+$/.test(emergencyNumber);
  return (
    <section
      role="alert"
      aria-label={t('title')}
      className="flex flex-col gap-3 rounded-tile border-2 border-danger bg-surface p-4"
      data-testid="emergency-card"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert aria-hidden="true" className="size-6 text-danger" strokeWidth={2} />
        <h3 className="text-base font-extrabold">{t('title')}</h3>
      </div>
      {callable ? (
        <a href={`tel:${emergencyNumber}`} className={buttonClasses('dark', 'md', 'w-fit')}>
          <Phone aria-hidden="true" className="size-5" />
          {t('call', { number: emergencyNumber })}
        </a>
      ) : (
        <p dir="ltr" className={cn('w-fit rounded-full bg-ink px-5 py-3 font-bold text-white')}>
          {t('call', { number: emergencyNumber })}
        </p>
      )}
      <p className="text-sm text-muted">{t('stopped')}</p>
    </section>
  );
}
