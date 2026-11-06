'use client';
/**
 * The drawn family tree (task 13, section 5): automatic layout, zoom, pan
 * and "Fit to screen". The FamilyMap.png style: white rounded boxes, the
 * condition marker square, a dashed border for "not sure", a dark border
 * for "you", and the neutral double line for a marriage between cousins.
 * Proposed people fade in with a dashed orange border; proposed links are
 * dashed; a new condition carries a small "new" tag.
 */
import { Maximize, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { layoutTree, NODE_H, NODE_W } from '@/lib/family/layout';
import type { Proposed } from '@/lib/family/proposal';
import type { Tree } from '@/lib/family/types';
import { focusRing } from './FamilyDialogs';
import { markerClass, markerFor, type useFamilyDisplay } from './display';

type Display = ReturnType<typeof useFamilyDisplay>;

function ZoomButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Plus; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('grid size-11 place-items-center rounded-full border border-line bg-surface shadow-card transition hover:bg-brand-tint-soft', focusRing)}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

// Design tokens (design/tokens.json): neutral line and brand orange.
const LINE = '#BFAEA2';
const PROPOSED = '#FF5A1F';
const MIN = 0.35;
const MAX = 1.8;

export function FamilyTree({
  tree,
  proposed,
  selectedId,
  onSelect,
  display,
  rtl,
}: {
  tree: Tree;
  proposed: Proposed;
  selectedId: string | null;
  onSelect: (id: string) => void;
  display: Display;
  rtl: boolean;
}) {
  const t = useTranslations('family.tree');
  const tf = useTranslations('dashboard.family');
  const layout = useMemo(() => layoutTree(tree, { rtl }), [tree, rtl]);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el || !layout.width) return;
    const s = Math.max(MIN, Math.min(1.1, (el.clientWidth - 24) / layout.width, (el.clientHeight - 24) / layout.height));
    setView({ s, x: (el.clientWidth - layout.width * s) / 2, y: Math.max(12, (el.clientHeight - layout.height * s) / 2) });
  }, [layout.width, layout.height]);

  // Re-fit as people appear, so the whole family stays in view.
  useLayoutEffect(() => {
    fit();
  }, [fit, tree.members.length]);
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  const zoom = (factor: number) => {
    const el = viewport.current;
    if (!el) return;
    setView((v) => {
      const s = Math.max(MIN, Math.min(MAX, v.s * factor));
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      return { s, x: cx - ((cx - v.x) / v.s) * s, y: cy - ((cy - v.y) / v.s) * s };
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const isDashed = (links: string[]) => links.length > 0 && links.every((id) => proposed.links.has(id));
  const newCondition = new Set(tree.conditions.filter((c) => proposed.conditions.has(c.id)).map((c) => c.memberId));

  return (
    <div className="relative">
      <div className="absolute end-2 top-2 z-10 flex gap-1.5">
        <ZoomButton label={t('zoomOut')} icon={Minus} onClick={() => zoom(1 / 1.2)} />
        <ZoomButton label={t('zoomIn')} icon={Plus} onClick={() => zoom(1.2)} />
        <ZoomButton label={t('fit')} icon={Maximize} onClick={() => fit()} />
      </div>
      <div
        ref={viewport}
        role="group"
        aria-label={tf('tree.aria')}
        aria-describedby="family-pan-hint"
        className="relative h-[380px] cursor-grab touch-none overflow-hidden rounded-tile bg-bg/60 select-none active:cursor-grabbing sm:h-[460px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => {
          // Pinch on a trackpad (ctrl + wheel) zooms; a plain wheel scrolls the page.
          if (e.ctrlKey) zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
        }}
      >
        <p id="family-pan-hint" className="sr-only">
          {t('panHint')}
        </p>
        <div
          data-testid="family-canvas"
          // Physical coordinates on purpose: the layout itself is mirrored for right-to-left.
          className="absolute top-0 left-0 origin-top-left transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        >
          <svg aria-hidden width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0" fill="none" strokeWidth={2}>
            {layout.segments.map((s, i) => (
              <path
                key={i}
                d={s.d}
                stroke={isDashed(s.links) ? PROPOSED : LINE}
                strokeDasharray={isDashed(s.links) ? '6 4' : undefined}
                strokeWidth={s.kind === 'coparent' ? 1.5 : 2}
                data-kind={s.kind}
              />
            ))}
          </svg>
          {layout.cousinLabels.map((l) => (
            <span key={l.link} className="absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-muted" style={{ left: l.x, top: l.y }}>
              {tf('tree.cousins')}
            </span>
          ))}
          {tree.members.map((m) => {
            const p = layout.pos[m.id];
            if (!p) return null;
            const isProposed = proposed.members.has(m.id);
            const rows = tree.conditions.filter((c) => c.memberId === m.id);
            const marker = markerFor(tree, m.id);
            const name = m.placeholder ? t('unknown') : display.name(m);
            const relation = display.relation(m);
            const showRelation = !m.isOwner && (m.placeholder || name !== relation);
            const condition = rows.length ? display.conditionLine(rows[0]) : tf('status.node.none');
            const unsure = !m.isOwner && (marker === 'not_sure' || m.placeholder);
            const selected = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                data-person={m.id}
                data-proposed={isProposed ? 'true' : undefined}
                data-placeholder={m.placeholder ? 'true' : undefined}
                aria-pressed={selected}
                aria-label={[name, showRelation ? relation : null, condition, isProposed ? t('proposed') : null].filter(Boolean).join(', ')}
                onClick={() => onSelect(m.id)}
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                className={cn(
                  'absolute flex items-center gap-2 overflow-visible rounded-xl bg-surface px-2.5 text-start transition-shadow hover:shadow-[0_2px_8px_rgba(120,60,20,0.12)]',
                  focusRing,
                  isProposed
                    ? 'border-[1.5px] border-dashed border-brand motion-safe:animate-card-in'
                    : m.isOwner
                      ? 'border-[1.5px] border-ink'
                      : unsure
                        ? 'border border-dashed border-neutral-line'
                        : 'border border-line-strong',
                  selected && 'shadow-[0_0_0_4px_rgba(255,90,31,0.22)]',
                )}
              >
                <span aria-hidden className={cn('size-3 shrink-0 rounded-[3px] border', markerClass[marker])} />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className={cn('block truncate text-[11px] leading-[1.2] font-bold', m.placeholder && 'font-semibold text-muted')}>
                    {name}
                  </span>
                  {showRelation ? (
                    <span className="block truncate text-[9.5px] leading-[1.2] text-muted">{relation}</span>
                  ) : null}
                  <span dir="auto" className="block truncate text-[9.5px] leading-[1.2] text-muted">
                    {condition}
                    {rows.length > 1 ? ` ${display.more(rows.length - 1)}` : ''}
                  </span>
                </span>
                {newCondition.has(m.id) ? (
                  <span className="absolute -top-2 end-2 rounded-full bg-brand px-1.5 py-px text-[9px] font-bold text-ink">{t('new')}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
