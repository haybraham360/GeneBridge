'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import type { Brief } from '@/lib/copilot/types';
import { prepareBrief } from '../copilotActions';

/**
 * The pre-session brief (task 16, section 2): a few points to prepare,
 * written from only what the patient shared on this request. Prepared only
 * when the counsellor asks, because it reads the shared data again (and
 * logs that read).
 */
export function CopilotBrief({ requestId }: { requestId: string }) {
  const t = useTranslations('pro.copilot.brief');
  const format = useFormatter();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<'error' | 'rate_limited' | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const result = await prepareBrief(requestId);
      if (result.ok) setBrief(result.data);
      else setError(result.error);
    });

  return (
    <section aria-labelledby={`brief-${requestId}`} className="flex flex-col gap-3 rounded-tile border border-brand-ring bg-brand-tint-soft p-4" data-testid="copilot-brief">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 id={`brief-${requestId}`} className="flex items-center gap-2 font-extrabold">
            <Sparkles aria-hidden="true" className="size-4.5 text-brand-text" strokeWidth={2} />
            {t('title')}
          </h3>
          <p className="text-[13px] text-muted">{t('subtitle')}</p>
        </div>
        <button type="button" onClick={run} disabled={pending} className={buttonClasses(brief ? 'ghost' : 'dark', 'sm')}>
          {brief ? <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} /> : null}
          {pending ? t('preparing') : brief ? t('refresh') : t('prepare')}
        </button>
      </div>

      {brief ? (
        <>
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-[15px] leading-[1.5]" aria-live="polite">
            {brief.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <p className="text-[13px] text-muted">
            {t(brief.engine === 'ai' ? 'sourceAi' : 'sourceRules', {
              time: format.dateTime(new Date(brief.generatedAt), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
            })}
          </p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {t(error === 'rate_limited' ? 'rateLimited' : 'error')}
        </p>
      ) : null}
    </section>
  );
}
