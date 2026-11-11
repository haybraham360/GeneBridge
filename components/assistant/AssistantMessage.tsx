'use client';

import { BookOpen, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import enReplies from '@/content/library/en/assistant/replies.json';
import arReplies from '@/content/library/ar/assistant/replies.json';
import { RiskVisual } from '@/components/genetics/RiskVisual';
import { ListenButton } from '@/components/ui/ListenButton';
import { Link } from '@/i18n/navigation';
import { speak } from '@/lib/audio/tts';
import { inline } from '@/lib/assistant/text';
import type { Reply, ReplyAction } from '@/lib/assistant/types';
import { cn } from '@/lib/cn';
import { EmergencyCard, EscalationCard, SupportCard } from './EscalationCards';

export type ReplyMeta = Pick<
  Reply,
  'category' | 'level' | 'sources' | 'actions' | 'engine'
> & {
  risk: Reply['risk'] | null;
  escalation: Reply['escalation'] | null;
  teachback: Reply['teachback'] | null;
  prepSummary: string | null;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: ReplyMeta;
  streaming?: boolean;
};

function postEvent(body: Record<string, unknown>) {
  void fetch('/api/assistant/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Renders **bold** spans (step labels); everything else stays plain text. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((part, i) => (i % 2 ? <strong key={i} className="font-bold">{part}</strong> : part))}</>;
}

/** Plain text with paragraphs, "•" bullet lines and **bold** labels. */
function Body({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split('\n');
        if (lines.every((l) => /^\s*•/.test(l) || /^\s{2}/.test(l))) {
          return (
            <ul key={i} className="flex flex-col gap-1.5 ps-1">
              {para.split(/\n(?=•)/).map((item, j) => (
                <li key={j} className="whitespace-pre-line">
                  <Inline text={item.replace(/^•\s*/, '• ')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            <Inline text={para} />
          </p>
        );
      })}
    </div>
  );
}

function Teachback({ offer }: { offer: NonNullable<ReplyMeta['teachback']> }) {
  const locale = useLocale() as 'en' | 'ar';
  const t = useTranslations('assistant.teachback');
  const copy = (locale === 'ar' ? arReplies : enReplies).teachback[offer.id];
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const correct = answer === offer.correct;
  return (
    <div className="flex flex-col gap-2 rounded-tile bg-bg p-3 text-sm">
      <p className="font-semibold">{copy.q}</p>
      {answer ? (
        <p role="status">{correct ? copy.right : copy.wrong}</p>
      ) : (
        <div className="flex gap-2">
          {(['yes', 'no'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAnswer(a);
                postEvent({ name: 'teachback_answered', question: offer.id, correct: a === offer.correct });
              }}
              className="min-h-11 cursor-pointer rounded-full border border-line-strong bg-surface px-5 font-semibold hover:bg-brand-tint-soft"
            >
              {t(a)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const actionHref: Partial<Record<ReplyAction, string>> = {
  values_exercise: '/dashboard/options',
  draft_family_message: '/dashboard/family',
  book_counsellor: '/dashboard/counsellor',
};

export function AssistantMessage({
  message,
  onRephrase,
  onTurnOnResult,
  compact = false,
}: {
  message: ChatMessage;
  onRephrase: (mode: 'simpler' | 'detail') => void;
  onTurnOnResult: () => void;
  compact?: boolean;
}) {
  const t = useTranslations('assistant');
  const locale = useLocale() as 'en' | 'ar';
  const [speaking, setSpeaking] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [prep, setPrep] = useState(message.meta?.prepSummary ?? '');
  const prepId = useId();
  useEffect(() => () => stopRef.current(), []);

  const meta = message.meta;
  const escalation = meta?.escalation;
  const sourceTitle = meta?.sources.find((s) => s.id !== 'options_overview')?.title;
  const condition = sourceTitle ? inline(sourceTitle, locale) : undefined;
  const actions = (meta?.actions ?? []).filter(
    (a) => !(a === 'book_counsellor' && escalation?.kind === 'counsellor') && a !== 'counselling_summary',
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Only the text fades in; escalation and risk never animate. */}
      <div
        className={cn(
          'max-w-prose rounded-2xl rounded-ss-sm bg-brand-tint-soft px-4 py-3 text-[15px] leading-relaxed',
          !message.streaming && 'motion-safe:animate-msg-in',
        )}
      >
        <span className="sr-only">{t('assistant')}: </span>
        {message.streaming ? <div aria-hidden="true" className="whitespace-pre-line">{message.text.replace(/\*\*/g, '')}</div> : <Body text={message.text} />}
      </div>

      {meta && !message.streaming ? (
        <>
          {meta.sources.length ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="source-chips">
              <span className="text-muted">{t('sources')}</span>
              {meta.sources.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-semibold">
                  <BookOpen aria-hidden="true" className="size-3.5 text-brand-text" strokeWidth={2} />
                  {s.title}
                </span>
              ))}
            </div>
          ) : null}

          {meta.risk ? <RiskVisual result={meta.risk} condition={condition} /> : null}

          {escalation?.kind === 'counsellor' ? (
            <EscalationCard trigger={escalation.trigger} urgency={escalation.urgency} defaultSummary={meta.prepSummary} />
          ) : escalation?.kind === 'support' ? (
            <SupportCard />
          ) : escalation?.kind === 'emergency' ? (
            <EmergencyCard />
          ) : null}

          {meta.prepSummary && !compact ? (
            <div className="flex flex-col gap-1.5 rounded-tile border border-line bg-surface p-3">
              <label htmlFor={prepId} className="text-sm font-bold">
                {t('prep.title')}
              </label>
              <textarea
                id={prepId}
                value={prep}
                onChange={(e) => setPrep(e.target.value)}
                rows={7}
                className="rounded-input border border-line-strong p-3 text-sm"
              />
              <p className="text-xs text-muted">{t('prep.note')}</p>
            </div>
          ) : null}

          {meta.teachback ? <Teachback offer={meta.teachback} /> : null}

          {actions.length ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) =>
                a === 'turn_on_result' ? (
                  <button key={a} type="button" onClick={onTurnOnResult} className={buttonLike}>
                    {t(`actions.${a}`)}
                  </button>
                ) : actionHref[a] ? (
                  <Link key={a} href={actionHref[a]!} className={buttonLike}>
                    {t(`actions.${a}`)}
                  </Link>
                ) : null,
              )}
            </div>
          ) : null}

          {escalation?.kind !== 'emergency' ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {meta.level < 3 && meta.category !== 'injection' && meta.category !== 'off_topic' ? (
                <>
                  <button type="button" onClick={() => onRephrase('simpler')} className={buttonLike}>
                    {t('simpler')}
                  </button>
                  {!compact ? (
                    <button type="button" onClick={() => onRephrase('detail')} className={buttonLike}>
                      {t('detail')}
                    </button>
                  ) : null}
                </>
              ) : null}
              <ListenButton
                className="size-11"
                speaking={speaking}
                onToggle={() => {
                  if (speaking) {
                    stopRef.current();
                    return;
                  }
                  setSpeaking(true);
                  stopRef.current = speak(message.text.replace(/•|\*\*/g, ''), locale, { onEnd: () => setSpeaking(false) });
                }}
              />
              <span className="ms-auto flex items-center gap-1">
                {feedback === null ? (
                  <>
                    <span className="sr-only">{t('feedback.question')}</span>
                    {([true, false] as const).map((helpful) => (
                      <button
                        key={String(helpful)}
                        type="button"
                        aria-label={helpful ? t('feedback.yes') : t('feedback.no')}
                        onClick={() => {
                          setFeedback(helpful);
                          postEvent({ name: 'ai_feedback', helpful });
                        }}
                        className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-brand-tint-soft hover:text-ink"
                      >
                        {helpful ? <ThumbsUp aria-hidden="true" className="size-4.5" /> : <ThumbsDown aria-hidden="true" className="size-4.5" />}
                      </button>
                    ))}
                  </>
                ) : (
                  <span role="status" className="text-xs text-muted">
                    {t('feedback.thanks')}
                  </span>
                )}
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const buttonLike =
  'inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-strong bg-surface px-4 text-[13px] font-semibold text-ink no-underline transition-colors hover:bg-brand-tint-soft';
