import type { Figure, TrendWeek } from './types';

/**
 * "Understanding over time": parsing and chart geometry. Pure, so it runs on
 * the server and in tests. Hidden weeks (fewer than 10 people) break the
 * lines instead of being drawn through, so no value is ever implied for them.
 */

type TrendRow = {
  weeks_ago: unknown;
  week_start: unknown;
  signups: unknown;
  pre_score: unknown;
  post_score: unknown;
};

function figure(value: unknown): Figure {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Database rows to weeks, oldest first. Rows that don't parse are dropped. */
export function trendWeeks(rows: readonly TrendRow[]): TrendWeek[] {
  return rows
    .map((row) => ({
      weeksAgo: Number(row.weeks_ago),
      weekStart: String(row.week_start ?? '').slice(0, 10),
      signups: figure(row.signups),
      preScore: figure(row.pre_score),
      postScore: figure(row.post_score),
    }))
    .filter(
      (w) => Number.isInteger(w.weeksAgo) && w.weeksAgo >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(w.weekStart),
    )
    .sort((a, b) => b.weeksAgo - a.weeksAgo);
}

/** Weeks where both scores are shown. */
export function scoredWeeks(weeks: readonly TrendWeek[]): TrendWeek[] {
  return weeks.filter((w) => w.preScore !== null && w.postScore !== null);
}

/** Average gain (after minus before) across the shown weeks, and its range. */
export function trendSummary(weeks: readonly TrendWeek[]): {
  shownWeeks: number;
  avgGain: Figure;
  minGain: Figure;
  maxGain: Figure;
} {
  const gains = scoredWeeks(weeks).map((w) => w.postScore! - w.preScore!);
  if (gains.length === 0) return { shownWeeks: 0, avgGain: null, minGain: null, maxGain: null };
  return {
    shownWeeks: gains.length,
    avgGain: gains.reduce((s, g) => s + g, 0) / gains.length,
    minGain: Math.min(...gains),
    maxGain: Math.max(...gains),
  };
}

export type Point = { x: number; y: number; index: number };

/**
 * Runs of consecutive shown values, as points. `x(i)` and `y(v)` map a week
 * index and a value to chart coordinates. A hidden week ends a run.
 */
export function segments(
  values: readonly Figure[],
  x: (i: number) => number,
  y: (v: number) => number,
): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push({ x: x(i), y: y(v), index: i });
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** An SVG path through one run of points. */
export function linePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join(' ');
}

/**
 * The band between the before and after lines, one closed path per run of
 * weeks where both are shown.
 */
export function bandPaths(
  weeks: readonly TrendWeek[],
  x: (i: number) => number,
  y: (v: number) => number,
): string[] {
  const both = weeks.map((w) => (w.preScore !== null && w.postScore !== null ? 1 : null));
  return segments(both, x, () => 0)
    .filter((run) => run.length > 1)
    .map((run) => {
      const top = run.map((p) => ({ ...p, y: y(weeks[p.index].postScore!) }));
      const bottom = [...run].reverse().map((p) => ({ ...p, y: y(weeks[p.index].preScore!) }));
      return `${linePath([...top, ...bottom])} Z`;
    });
}
