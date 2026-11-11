'use client';

import { CircleCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { blocking, checkSummary } from '@/lib/copilot/check';
import type { CopilotContext, CopilotPerson } from '@/lib/copilot/types';
import { proLabels, type Translate } from '@/lib/pro/labels';
import { approveSummary, draftSummary, loadCopilot, saveSummary } from '../copilotActions';

type Props = {
  requestId: string;
  /** The session note as it is now: the only source for the summary. */
  notes: string;
  onAnnounce: (message: string) => void;
};

/**
 * After the session (task 16, section 3): a plain-language summary for each
 * person, in their own language. The AI drafts it from the counsellor's
 * notes; the counsellor edits it and approves it. Nothing reaches the
 * patient before "Approve and send".
 */
export function CopilotSummary({ requestId, notes, onAnnounce }: Props) {
  const t = useTranslations('pro.copilot.summary');
  const [ctx, setCtx] = useState<CopilotContext | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void loadCopilot(requestId).then((r) => {
      if (!live) return;
      if (r.ok) setCtx(r.data);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [requestId]);

  if (failed) return null;
  if (!ctx) return <p className="text-[13px] text-muted">{t('loading')}</p>;

  return (
    <section aria-labelledby={`summary-${requestId}`} className="flex flex-col gap-3" data-testid="copilot-summary">
      <div className="flex flex-col gap-1">
        <h3 id={`summary-${requestId}`} className="font-extrabold">
          {t('title')}
        </h3>
        <p className="text-[13px] text-muted">{t(ctx.aiEnabled ? 'subtitle' : 'subtitleManual')}</p>
      </div>
      {ctx.people.map((p) => (
        <PersonSummary
          key={`${p.role}-${p.summary?.updatedAt ?? 'new'}`}
          requestId={requestId}
          person={p}
          isCouple={ctx.isCouple}
          aiEnabled={ctx.aiEnabled}
          notes={notes}
          onContext={setCtx}
          onAnnounce={onAnnounce}
        />
      ))}
    </section>
  );
}

type DraftError = 'error' | 'rate_limited' | 'not_set_up' | 'no_notes' | 'failed' | 'blocked' | 'needs_confirm';

function PersonSummary({
  requestId,
  person,
  isCouple,
  aiEnabled,
  notes,
  onContext,
  onAnnounce,
}: {
  requestId: string;
  person: CopilotPerson;
  isCouple: boolean;
  aiEnabled: boolean;
  notes: string;
  onContext: (ctx: CopilotContext) => void;
  onAnnounce: (message: string) => void;
}) {
  const t = useTranslations('pro.copilot.summary');
  const tp = useTranslations('pro');
  const format = useFormatter();
  const L = useMemo(() => proLabels(tp as unknown as Translate), [tp]);
  const [body, setBody] = useState(person.summary?.body ?? '');
  const [saved, setSaved] = useState(person.summary?.body ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<DraftError | null>(null);
  const [pending, start] = useTransition();

  const name = L.person(person.label);
  const language = tp(`detail.languages.${person.locale}`);
  const approved = person.summary?.status === 'approved';
  const problems = useMemo(() => (body.trim() ? checkSummary(body, notes, person.locale) : []), [body, notes, person.locale]);
  const blockers = blocking(problems);
  const id = `summary-${requestId}-${person.role}`;

  if (approved && person.summary) {
    return (
      <div className="flex flex-col gap-2 rounded-tile bg-bg p-4" data-testid={`summary-${person.role}-approved`}>
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
          <CircleCheck aria-hidden="true" className="size-4 text-unaffected" strokeWidth={2} />
          {t('sentTo', { name, date: format.dateTime(new Date(person.summary.approvedAt ?? person.summary.updatedAt), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })}
        </p>
        <p className="text-sm leading-[1.55] whitespace-pre-line" dir={person.locale === 'ar' ? 'rtl' : 'ltr'} lang={person.locale}>
          {person.summary.body}
        </p>
      </div>
    );
  }

  const draft = () =>
    start(async () => {
      setError(null);
      const result = await draftSummary({ requestId, person: person.role, notes });
      if (!result.ok) return setError(result.error);
      onContext(result.data);
      onAnnounce(t('drafted', { name }));
    });

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveSummary({ requestId, person: person.role, body });
      if (!result.ok) return setError('error');
      setSaved(body);
      onAnnounce(t('savedDraft'));
    });

  const approve = () =>
    start(async () => {
      setError(null);
      const result = await approveSummary({ requestId, person: person.role, body, notes, confirmed });
      if (!result.ok) return setError(result.error);
      onContext(result.data);
      onAnnounce(t('sent', { name }));
    });

  return (
    <div className="flex flex-col gap-3 rounded-tile border border-line p-4" data-testid={`summary-${person.role}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-bold">
          {isCouple ? t('forPerson', { name, language }) : t('forPatient', { language })}
        </label>
        {aiEnabled ? (
          <button type="button" onClick={draft} disabled={pending} className={buttonClasses('ghost', 'sm')}>
            <Sparkles aria-hidden="true" className="size-4" strokeWidth={2} />
            {pending ? t('working') : body.trim() ? t('redraft') : t('draft')}
          </button>
        ) : null}
      </div>

      {person.summary?.engine === 'ai' ? <p className="text-[13px] text-muted">{t('aiNote')}</p> : null}

      <textarea
        id={id}
        rows={7}
        value={body}
        maxLength={6000}
        dir={person.locale === 'ar' ? 'rtl' : 'ltr'}
        lang={person.locale}
        placeholder={t(aiEnabled ? 'placeholder' : 'placeholderManual')}
        onChange={(e) => {
          setBody(e.target.value);
          setConfirmed(false);
        }}
        className="w-full resize-y rounded-input border border-line-strong px-3.5 py-3 text-[15px] leading-[1.55] placeholder:text-muted focus-visible:border-ink"
      />

      {problems.length > 0 ? (
        <div role="status" className={cn('flex flex-col gap-2 rounded-xl p-3.5 text-sm', blockers.length ? 'bg-affected-tint text-affected' : 'bg-brand-tint-soft text-brand-text-dark')}>
          <p className="flex items-center gap-2 font-bold">
            <TriangleAlert aria-hidden="true" className="size-4 flex-none" strokeWidth={2} />
            {t(blockers.length ? 'problemsBlocking' : 'problemsCheck')}
          </p>
          <ul className="flex list-disc flex-col gap-1 ps-5">
            {problems.map((p) => (
              <li key={p}>{t(`problems.${p}`)}</li>
            ))}
          </ul>
          {blockers.length === 0 ? (
            <label className="flex min-h-11 items-center gap-2.5 font-semibold">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-5 accent-ink" />
              {t('confirmChecked')}
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={approve}
          disabled={pending || !body.trim() || blockers.length > 0 || (problems.length > 0 && !confirmed)}
          className={buttonClasses('primary', 'sm')}
        >
          {t('approve')}
        </button>
        <button type="button" onClick={save} disabled={pending || body === saved} className={buttonClasses('ghost', 'sm')}>
          {t('saveDraft')}
        </button>
        <p className="text-[13px] text-muted">{t('notSentYet', { name })}</p>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
