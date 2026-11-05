'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { saveCheckin, type Feeling } from '@/app/[locale]/(app)/dashboard/talk/actions';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { sendTalkEvent } from './talkClient';

const FEELINGS: Feeling[] = ['calm', 'unsure', 'worried', 'overwhelmed'];

// This visit's answer, so the question isn't asked again on the same visit.
const VISIT_KEY = 'gb-talk-checkin';

/**
 * "How are you feeling about all this?" (task 09 section 3). Optional, never
 * a pop-up, offered once per visit. Saved privately (owner-only); the event
 * carries no feeling.
 */
export function FeelingsCheckin({ supportLine }: { supportLine: string }) {
  const t = useTranslations('talk.checkin');
  const tSupport = useTranslations('assistant.support.resources');
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [, startTransition] = useTransition();

  // Restore this visit's answer (sessionStorage is per tab and per visit).
  useEffect(() => {
    const stored = sessionStorage.getItem(VISIT_KEY) as Feeling | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    if (stored && FEELINGS.includes(stored)) setFeeling(stored);
  }, []);

  const pick = (value: Feeling) => {
    if (value === feeling) return;
    setFeeling(value);
    setSaveError(false);
    sessionStorage.setItem(VISIT_KEY, value);
    startTransition(async () => {
      const result = await saveCheckin(value).catch(() => ({ ok: false }));
      if (!result.ok) setSaveError(true);
    });
  };

  const support = feeling === 'worried' || feeling === 'overwhelmed';
  const callable = /^\+?\d[\d\s-]{2,}$/.test(supportLine);

  return (
    <section aria-labelledby="checkin-title" className={cn(cardClasses, 'flex flex-col gap-3.5 p-6')}>
      <h2 id="checkin-title" className="text-xl font-extrabold tracking-[-0.01em]">
        {t('title')}
      </h2>
      <p id="checkin-hint" className="text-sm text-muted">
        {t('subtitle')}
      </p>
      <div role="group" aria-labelledby="checkin-title" aria-describedby="checkin-hint" className="grid grid-cols-2 gap-2">
        {FEELINGS.map((value) => {
          const on = feeling === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => pick(value)}
              className={cn(
                'min-h-12 cursor-pointer rounded-input border text-sm font-bold transition-colors duration-200',
                on ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface hover:bg-brand-tint-soft',
              )}
            >
              {t(`feelings.${value}`)}
            </button>
          );
        })}
      </div>

      <div aria-live="polite">
        {feeling && !support ? (
          <p className="rounded-tile bg-bg px-4 py-3.5 text-sm leading-[1.55] motion-safe:animate-cross-fade">{t('ok')}</p>
        ) : null}
        {support ? (
          <div
            data-testid="support-card"
            className="flex flex-col gap-2.5 rounded-tile bg-brand-tint-soft p-4 motion-safe:animate-cross-fade"
          >
            <p className="font-extrabold">{t('supportTitle')}</p>
            <p className="text-sm leading-[1.55]">{t('supportBody')}</p>
            <Link
              href="/dashboard/counsellor"
              onClick={() => sendTalkEvent({ name: 'talk_counsellor_clicked' })}
              className={buttonClasses('dark', 'sm')}
            >
              {t('supportCta')}
            </Link>
            {feeling === 'overwhelmed' ? (
              <div data-testid="support-line" className="flex flex-col gap-2">
                <p className="text-sm text-muted">
                  {tSupport('mentalHealth')}. {t('supportLine', { phone: supportLine })}
                </p>
                {callable ? (
                  <a href={`tel:${supportLine.replace(/[\s-]/g, '')}`} className={buttonClasses('ghost', 'sm')}>
                    {t('talkNow')}
                  </a>
                ) : (
                  // The number is a placeholder until confirmed (config/support-resources.ts).
                  <span aria-disabled="true" className={buttonClasses('ghost', 'sm', 'cursor-default opacity-70 hover:translate-y-0 hover:shadow-none')}>
                    {t('talkNow')}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {saveError ? <p className="mt-2 text-sm text-muted">{t('saveError')}</p> : null}
      </div>
    </section>
  );
}
