'use client';
/**
 * Clarifying questions with quick-answer chips (task 13, section 1). At most
 * two per turn. A model question's answer goes back as the next turn; a
 * "Do you mean …?" catalogue suggestion is settled right here.
 */
import { Volume2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cardClasses } from '@/components/ui/Card';
import { narrate, type Narration } from '@/lib/audio/tts';
import { cn } from '@/lib/cn';
import { focusRing } from './FamilyDialogs';

export type ShownQuestion = { id: string; text: string; choices: { label: string; value: string }[] };

export function QuestionCard({
  questions,
  busy,
  onAnswer,
}: {
  questions: ShownQuestion[];
  busy: boolean;
  onAnswer: (questionId: string, value: string, label: string) => void;
}) {
  const t = useTranslations('family.question');
  const locale = useLocale() as 'ar' | 'en';
  const narration = useRef<Narration | null>(null);
  useEffect(() => () => narration.current?.stop(), []);
  if (!questions.length) return null;

  return (
    <section aria-labelledby="family-questions" className={cn(cardClasses, 'border-brand-ring bg-brand-tint-soft p-5 motion-safe:animate-card-in')} data-testid="family-questions">
      <h2 id="family-questions" className="text-sm font-extrabold tracking-[-0.02em]">
        {t('title')}
      </h2>
      <ul className="mt-3 space-y-4">
        {questions.map((q) => (
          <li key={q.id} data-question={q.id}>
            <div className="flex items-start gap-2">
              <p dir="auto" className="flex-1 text-[14px] leading-relaxed font-semibold">
                {q.text}
              </p>
              <button
                type="button"
                aria-label={t('listen')}
                title={t('listen')}
                onClick={() => {
                  narration.current?.stop();
                  narration.current = narrate([q.text], /[؀-ۿ]/u.test(q.text) ? 'ar' : locale);
                }}
                className={cn('grid size-11 shrink-0 place-items-center rounded-full bg-surface text-brand-text transition hover:bg-brand-tint', focusRing)}
              >
                <Volume2 className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  disabled={busy}
                  onClick={() => onAnswer(q.id, c.value, c.label)}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-[13px] font-semibold text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50',
                    focusRing,
                  )}
                >
                  <span dir="auto">{c.label}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
