'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { bandPaths, linePath, segments } from '@/lib/analytics/trend';
import type { TrendWeek } from '@/lib/analytics/types';
import { cn } from '@/lib/cn';

/** Formatted on the server, so the client never formats a figure itself. */
export type TrendLabels = {
  /** Short axis date per week, e.g. "5 Nov". */
  axis: string[];
  /** Tooltip heading per week, e.g. "Week of 5 Nov 2026". */
  heading: string[];
  before: (string | null)[];
  after: (string | null)[];
  gain: (string | null)[];
  signups: (string | null)[];
};

const LINE_H = 220;
const BAR_H = 56;
const GAP = 54; // x-axis dates, then the sign-ups label, between the two charts
const PAD = { top: 12, bottom: 8 };
const Y_AXIS = 40;
const END_LABEL = 96; // room at the end for the direct labels
const TICKS = [0, 25, 50, 75, 100];

/**
 * "Understanding over time": before and after lines with the gain shaded
 * between them, and a separate sign-ups strip underneath (two measures, two
 * charts: never a second axis). Hidden weeks break the lines and leave an
 * empty bar slot. Mirrors in Arabic so time runs with the reading direction.
 * The panel's "View as table" holds every figure, so the SVG is decorative.
 */
export function TrendChart({ weeks, labels }: { weeks: TrendWeek[]; labels: TrendLabels }) {
  const t = useTranslations('analytics');
  const rtl = useLocale() === 'ar';
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = weeks.length;
  const narrow = width < 480;
  const endRoom = narrow ? 0 : END_LABEL;
  const plotW = width - Y_AXIS - endRoom;
  const step = n > 1 ? plotW / (n - 1) : 0;
  // Logical x: 0 at the oldest week. Physical x flips in Arabic.
  const lx = (i: number) => (n > 1 ? i * step : plotW / 2);
  const x = (i: number) => (rtl ? endRoom + plotW - lx(i) : Y_AXIS + lx(i));
  const y = (v: number) => PAD.top + (1 - v / 100) * (LINE_H - PAD.top - PAD.bottom);

  const pre = segments(weeks.map((w) => w.preScore), x, y);
  const post = segments(weeks.map((w) => w.postScore), x, y);
  const bands = bandPaths(weeks, x, y);

  const maxSignups = Math.max(1, ...weeks.map((w) => w.signups ?? 0));
  const barW = Math.min(24, Math.max(4, (n > 1 ? step : plotW) * 0.55));
  const barTop = LINE_H + GAP;
  const barY = (v: number) => barTop + BAR_H - (v / maxSignups) * BAR_H;
  const height = barTop + BAR_H + 4;

  // Every nth axis label, so they never collide (~64px each).
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))));

  // Direct labels at the newest shown point of each line.
  const lastPre = pre.at(-1)?.at(-1);
  const lastPost = post.at(-1)?.at(-1);
  let preLabelY = lastPre?.y ?? 0;
  let postLabelY = lastPost?.y ?? 0;
  if (lastPre && lastPost && Math.abs(preLabelY - postLabelY) < 30) {
    const mid = (preLabelY + postLabelY) / 2;
    postLabelY = mid - 15;
    preLabelY = mid + 15;
  }
  const labelX = (p: { x: number }) => (rtl ? p.x - 10 : p.x + 10);
  const labelAnchor = rtl ? 'end' : 'start';

  const tip = active === null ? null : weeks[active];

  return (
    <div className="flex flex-col gap-3">
      <Legend before={t('trend.before')} after={t('trend.after')} />

      <div
        ref={box}
        className="relative"
        onMouseLeave={() => setActive(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          // Laid out left to right: positions already mirror for Arabic above, and in an
          // RTL document text-anchor start/end would flip a second time.
          direction="ltr"
          className="block max-w-full overflow-visible"
        >
          {/* Recessive hairline grid and y-axis ticks. */}
          {TICKS.map((v) => (
            <g key={v}>
              <line
                x1={rtl ? endRoom : Y_AXIS}
                x2={rtl ? width - Y_AXIS : width - endRoom}
                y1={y(v)}
                y2={y(v)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={rtl ? width - Y_AXIS + 8 : Y_AXIS - 8}
                y={y(v)}
                dy="0.32em"
                textAnchor={rtl ? 'start' : 'end'}
                className="fill-muted text-[11px]"
              >
                {v}%
              </text>
            </g>
          ))}

          {/* The gain: a 10% wash of the "after" colour between the lines. */}
          {bands.map((d, i) => (
            <path key={i} d={d} className="fill-brand/10" />
          ))}

          {/* Crosshair. */}
          {active !== null ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={barTop + BAR_H}
              className="stroke-ink-soft"
              strokeWidth={1}
            />
          ) : null}

          {pre.map((run, i) => (
            <path key={`pre${i}`} d={linePath(run)} fill="none" className="stroke-muted" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {post.map((run, i) => (
            <path key={`post${i}`} d={linePath(run)} fill="none" className="stroke-brand" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* A lone shown week between hidden ones has no line: give it a dot. */}
          {[...pre.filter((r) => r.length === 1), ...post.filter((r) => r.length === 1)].map((run, i) => (
            <circle key={`solo${i}`} cx={run[0].x} cy={run[0].y} r={4} className={cn('stroke-surface', pre.includes(run) ? 'fill-muted' : 'fill-brand')} strokeWidth={2} />
          ))}

          {/* End dots, plus the hovered week's dots. Surface ring keeps them legible. */}
          {[lastPre, lastPost].map((p, i) =>
            p ? <circle key={`end${i}`} cx={p.x} cy={p.y} r={4} className={cn('stroke-surface', i ? 'fill-brand' : 'fill-muted')} strokeWidth={2} /> : null,
          )}
          {tip && tip.preScore !== null ? <circle cx={x(active!)} cy={y(tip.preScore)} r={5} className="fill-muted stroke-surface" strokeWidth={2} /> : null}
          {tip && tip.postScore !== null ? <circle cx={x(active!)} cy={y(tip.postScore)} r={5} className="fill-brand stroke-surface" strokeWidth={2} /> : null}

          {/* Direct labels: text in text tokens, identity from the dot beside it. */}
          {!narrow && lastPost && labels.after[lastPost.index] ? (
            <text x={labelX(lastPost)} y={postLabelY} dy="0.32em" textAnchor={labelAnchor} className="fill-ink text-[13px] font-bold">
              {labels.after[lastPost.index]}
            </text>
          ) : null}
          {!narrow && lastPre && labels.before[lastPre.index] ? (
            <text x={labelX(lastPre)} y={preLabelY} dy="0.32em" textAnchor={labelAnchor} className="fill-ink-soft text-[13px] font-semibold">
              {labels.before[lastPre.index]}
            </text>
          ) : null}

          {/* X-axis dates. */}
          {weeks.map((_, i) => {
            if ((n - 1 - i) % every !== 0) return null;
            // Labels near an edge anchor inward so they're never clipped.
            const px = x(i);
            const anchor = px < 32 ? 'start' : px > width - 32 ? 'end' : 'middle';
            return (
              <text key={`ax${i}`} x={px} y={LINE_H + 20} textAnchor={anchor} className="fill-muted text-[11px]">
                {labels.axis[i]}
              </text>
            );
          })}

          {/* Sign-ups strip: thin columns, 4px rounded tops, square at the baseline. */}
          <text
            x={rtl ? width - Y_AXIS : Y_AXIS}
            y={barTop - 8}
            textAnchor={rtl ? 'end' : 'start'}
            className="fill-muted text-[12px] font-semibold"
          >
            {t('trend.signups')}
          </text>
          <line
            x1={rtl ? endRoom : Y_AXIS}
            x2={rtl ? width - Y_AXIS : width - endRoom}
            y1={barTop + BAR_H}
            y2={barTop + BAR_H}
            className="stroke-line"
            strokeWidth={1}
          />
          {weeks.map((w, i) =>
            w.signups !== null ? (
              <path
                key={`bar${i}`}
                d={columnPath(x(i) - barW / 2, barY(w.signups), barW, barTop + BAR_H - barY(w.signups))}
                className={active === i ? 'fill-ink' : 'fill-ink/70'}
              />
            ) : null,
          )}

          {/* Hover targets: one full-height column per week. */}
          {weeks.map((_, i) => {
            const half = n > 1 ? step / 2 : plotW / 2;
            return (
              <rect
                key={`hit${i}`}
                x={x(i) - half}
                y={0}
                width={half * 2}
                height={height}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
              />
            );
          })}
        </svg>

        {tip ? (
          <Tooltip
            x={x(active!)}
            width={width}
            heading={labels.heading[active!]}
            rows={[
              { key: 'after', swatch: 'bg-brand', label: t('trend.after'), value: labels.after[active!] ?? t('hidden') },
              { key: 'before', swatch: 'bg-muted', label: t('trend.before'), value: labels.before[active!] ?? t('hidden') },
              { key: 'gain', swatch: null, label: t('trend.gain'), value: labels.gain[active!] ?? t('hidden') },
              { key: 'signups', swatch: 'bg-ink/70', label: t('trend.columns.signups'), value: labels.signups[active!] ?? t('hidden') },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A column with a 4px rounded top and a square base. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(x)} ${f(y + h)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h)} Z`;
}

function Legend({ before, after }: { before: string; after: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold text-ink-soft">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-brand" />
        {after}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-muted" />
        {before}
      </li>
    </ul>
  );
}

function Tooltip({
  x,
  width,
  heading,
  rows,
}: {
  x: number;
  width: number;
  heading: string;
  rows: { key: string; swatch: string | null; label: string; value: string }[];
}) {
  const W = 200;
  // Physical position, kept inside the chart; flips to the other side of the crosshair near an edge.
  const left = x + 12 + W > width ? Math.max(0, x - 12 - W) : x + 12;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-2 z-10 flex w-50 flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 text-[13px] shadow-card"
      // Physical left on purpose: it follows the SVG's physical x, which already mirrors in Arabic.
      style={{ left }}
    >
      <span className="font-bold">{heading}</span>
      {rows.map((row) => (
        <span key={row.key} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-ink-soft">
            {row.swatch ? <span aria-hidden="true" className={cn('size-2.5 rounded-full', row.swatch)} /> : <span aria-hidden="true" className="size-2.5" />}
            {row.label}
          </span>
          <span className="font-bold tabular-nums">{row.value}</span>
        </span>
      ))}
    </div>
  );
}
