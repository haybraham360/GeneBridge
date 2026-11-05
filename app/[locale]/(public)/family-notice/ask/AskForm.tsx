'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { askAction, type AskState } from './actions';

const initial: AskState = { question: '', answer: null };

/** The public question box. A plain form: it also works without JavaScript. */
export function AskForm({ maxLength }: { maxLength: number }) {
  const t = useTranslations('notice.ask');
  const [state, action, pending] = useActionState(askAction, initial);
  const answer = state.answer;

  const error =
    answer?.status === 'empty'
      ? t('empty')
      : answer?.status === 'too_long'
        ? t('tooLong', { max: maxLength })
        : answer?.status === 'rate_limited'
          ? t('rateLimited')
          : answer?.status === 'error'
            ? t('error')
            : null;

  return (
    <>
      <form action={action} className={cn(cardClasses, 'flex flex-col gap-3 p-[clamp(20px,4vw,32px)]')}>
        <label htmlFor="question" className="text-base font-bold">
          {t('label')}
        </label>
        <textarea
          id="question"
          name="question"
          rows={3}
          maxLength={maxLength}
          defaultValue={state.question}
          placeholder={t('placeholder')}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'question-error' : undefined}
          className="min-h-28 rounded-input border border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/70 focus-visible:border-ink"
        />
        {error ? (
          <p id="question-error" role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={buttonClasses('dark', 'md', 'self-start disabled:cursor-wait disabled:opacity-70')}
        >
          {pending ? t('thinking') : t('submit')}
        </button>
      </form>

      {answer?.status === 'answered' ? (
        <section
          aria-live="polite"
          aria-labelledby="answer-title"
          className={cn(cardClasses, 'flex flex-col gap-3 p-[clamp(20px,4vw,32px)] motion-safe:animate-fade-up')}
        >
          <h2 id="answer-title" className="text-lg font-extrabold">
            {t('answerLabel')}
          </h2>
          <p className="text-base leading-[1.6] whitespace-pre-line">{answer.personal ? t('personal') : answer.text}</p>
          {answer.sources.length ? (
            <p className="text-sm text-muted">
              {t('sources')}: {answer.sources.join(' · ')}
            </p>
          ) : null}
          <p className="text-sm text-muted">{t('general')}</p>
          {answer.counsellor ? (
            <Link
              href={`/auth?next=${encodeURIComponent('/dashboard/counsellor')}`}
              prefetch={false}
              className={buttonClasses('ghost', 'md', 'self-start')}
            >
              {/* Same wording as the notice page's button. */}
              {t('counsellor')}
            </Link>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
