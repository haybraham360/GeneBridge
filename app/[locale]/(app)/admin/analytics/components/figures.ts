import { useFormatter, useTranslations } from 'next-intl';
import type { Figure, KpiSet } from '@/lib/analytics/types';

/**
 * Locale-aware formatting for dashboard figures. Every helper returns null
 * for a hidden figure (group under 10); callers show `hidden` instead.
 * Figures are rounded for display only; the CSV keeps one decimal.
 */
export function useFigures() {
  const t = useTranslations('analytics');
  const format = useFormatter();
  const whole = (v: number, signed = false) =>
    format.number(Math.round(v), { signDisplay: signed ? 'exceptZero' : 'auto' });

  return {
    hidden: t('hidden'),
    count: (v: Figure) => (v === null ? null : whole(v)),
    percent: (v: Figure) =>
      v === null ? null : format.number(Math.round(v) / 100, { style: 'percent' }),
    points: (v: Figure) =>
      v === null ? null : t('units.points', { value: whole(v, true), count: Math.abs(Math.round(v)) }),
    days: (v: Figure) => (v === null ? null : t('units.days', { count: Math.round(v) })),
    number: (v: Figure) => (v === null ? null : whole(v)),
  };
}

export type KpiKey = 'understanding' | 'uptake' | 'referral' | 'onboarding';

/** Teach-back gain (after minus before), or null when either is hidden. */
export function understandingGain(set: KpiSet): Figure {
  return set.preScore === null || set.postScore === null ? null : set.postScore - set.preScore;
}

/** The figure a tile compares with the previous period. */
export function comparedFigure(key: KpiKey, set: KpiSet): Figure {
  switch (key) {
    case 'understanding':
      return understandingGain(set);
    case 'uptake':
      return set.uptakePct;
    case 'referral':
      return set.medianDays;
    case 'onboarding':
      return set.onboardingPct;
  }
}

export type Change =
  | { kind: 'allTime' }
  | { kind: 'unavailable' }
  | { kind: 'same' }
  | { kind: 'up' | 'down'; amount: number };

/** Change against the previous period, rounded to whole points or days. */
export function kpiChange(key: KpiKey, current: KpiSet, previous: KpiSet | null): Change {
  if (!previous) return { kind: 'allTime' };
  const now = comparedFigure(key, current);
  const before = comparedFigure(key, previous);
  if (now === null || before === null) return { kind: 'unavailable' };
  const diff = Math.round(now) - Math.round(before);
  if (diff === 0) return { kind: 'same' };
  return { kind: diff > 0 ? 'up' : 'down', amount: Math.abs(diff) };
}
