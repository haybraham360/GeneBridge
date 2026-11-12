import { describe, expect, it } from 'vitest';
import { bandPaths, linePath, segments, trendSummary, trendWeeks } from './trend';
import type { TrendWeek } from './types';

const week = (weeksAgo: number, pre: number | null, post: number | null, signups: number | null = 40): TrendWeek => ({
  weeksAgo,
  weekStart: `2026-10-${String(10 + weeksAgo).padStart(2, '0')}`,
  signups,
  preScore: pre,
  postScore: post,
});

describe('trendWeeks', () => {
  it('orders oldest first, parses numbers and keeps hidden weeks as null', () => {
    expect(
      trendWeeks([
        { weeks_ago: 0, week_start: '2026-11-05', signups: 52, pre_score: '51.5', post_score: '84' },
        { weeks_ago: 1, week_start: '2026-10-29', signups: null, pre_score: null, post_score: null },
      ]),
    ).toEqual([
      { weeksAgo: 1, weekStart: '2026-10-29', signups: null, preScore: null, postScore: null },
      { weeksAgo: 0, weekStart: '2026-11-05', signups: 52, preScore: 51.5, postScore: 84 },
    ]);
  });

  it('drops rows that do not parse', () => {
    expect(trendWeeks([{ weeks_ago: 'x', week_start: 'soon', signups: 1, pre_score: 1, post_score: 1 }])).toEqual([]);
  });
});

describe('trendSummary', () => {
  it('averages the gain over weeks where both scores are shown', () => {
    expect(trendSummary([week(2, 50, 80), week(1, null, null), week(0, 52, 86)])).toEqual({
      shownWeeks: 2,
      avgGain: 32,
      minGain: 30,
      maxGain: 34,
    });
  });

  it('is empty when every week is hidden', () => {
    expect(trendSummary([week(0, null, null)]).avgGain).toBeNull();
  });
});

describe('chart geometry', () => {
  const x = (i: number) => i * 10;
  const y = (v: number) => 100 - v;

  it('breaks lines at hidden weeks instead of drawing through them', () => {
    const runs = segments([50, 60, null, 70], x, y);
    expect(runs.map((r) => r.map((p) => p.index))).toEqual([[0, 1], [3]]);
    expect(linePath(runs[0])).toBe('M0 50 L10 40');
  });

  it('draws the band only where both lines are shown for at least two weeks', () => {
    const weeks = [week(3, 50, 80), week(2, 52, 84), week(1, null, null), week(0, 51, 85)];
    expect(bandPaths(weeks, x, y)).toEqual(['M0 20 L10 16 L10 48 L0 50 Z']);
  });
});
