'use client';
/**
 * The review bar under the tree (task 13, section 1): what was proposed,
 * then Keep all, Review one by one (Keep / Skip / Edit) or Undo. Neutral
 * wording for a cousin marriage, no warning colours.
 */
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ProposalCounts } from '@/lib/family/proposal';

export function ReviewBar({
  counts,
  saving,
  review,
  error,
  highlight = false,
  onKeepAll,
  onStartReview,
  onUndo,
}: {
  counts: ProposalCounts;
  saving: boolean;
  /** Set while reviewing one by one. */
  review: null | { label: string; index: number; total: number; onKeep: () => void; onSkip: () => void; onEdit: (() => void) | null; onStop: () => void };
  error: string | null;
  /** Rings the bar a few times when it appears, so the eye finds it. */
  highlight?: boolean;
  onKeepAll: () => void;
  onStartReview: () => void;
  onUndo: () => void;
}) {
  const t = useTranslations('family.review');
  return (
    <section
      id="family-review"
      aria-labelledby="family-review-title"
      aria-live="polite"
      className={cn(cardClasses, 'mt-4 scroll-mt-24 border-dashed border-brand p-4', highlight ? 'motion-safe:animate-attention' : 'motion-safe:animate-card-in')}
      data-testid="family-review"
    >
      <h2 id="family-review-title" className="sr-only">
        {t('title')}
      </h2>
      {review ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted">{t('step', { current: review.index + 1, total: review.total })}</p>
          <p dir="auto" className="text-[15px] font-semibold" data-testid="family-review-item">
            {review.label}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={review.onKeep} disabled={saving}>
              {t('keep')}
            </Button>
            <Button size="sm" variant="ghost" onClick={review.onSkip} disabled={saving}>
              {t('skip')}
            </Button>
            {review.onEdit ? (
              <Button size="sm" variant="ghost" onClick={review.onEdit} disabled={saving}>
                {t('edit')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={review.onStop} className="ms-auto">
              {t('done')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold" data-testid="family-review-summary">
              {t('summary', { people: counts.people, conditions: counts.conditions })}
              {counts.cousins ? ` ${t('cousins')}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {counts.placeholders ? `${t('placeholders', { count: counts.placeholders })} ` : ''}
              {t('hint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onKeepAll} disabled={saving}>
              {saving ? t('saving') : t('keepAll')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onStartReview} disabled={saving}>
              {t('oneByOne')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onUndo} disabled={saving}>
              {t('undo')}
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-brand-text-dark">
          {error}
        </p>
      ) : null}
    </section>
  );
}
