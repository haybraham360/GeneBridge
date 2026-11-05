'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { Chances, InheritanceResult } from '@/lib/genetics/inheritance';
import { cn } from '@/lib/cn';

type Outcome = keyof Chances;

/** Colour is never the only signal: every figure and figure group has a text label. */
const figureStyle: Record<Outcome, { fill: string; stroke: string; text: string }> = {
  affected: { fill: 'fill-affected', stroke: 'stroke-affected', text: 'text-affected' },
  carrier: { fill: 'fill-brand', stroke: 'stroke-brand-text', text: 'text-brand-text' },
  unaffected: { fill: 'fill-surface', stroke: 'stroke-muted', text: 'text-unaffected' },
};

function Figure({ outcome }: { outcome: Outcome }) {
  const s = figureStyle[outcome];
  return (
    <svg viewBox="0 0 44 56" className="h-11 w-9 flex-none" aria-hidden="true" focusable="false">
      <circle cx="22" cy="11" r="9" className={cn(s.fill, s.stroke)} strokeWidth="2.5" />
      <path
        d="M3.5 54.5 V47 C3.5 35.5 11.5 27.5 22 27.5 C32.5 27.5 40.5 35.5 40.5 47 V54.5 Z"
        className={cn(s.fill, s.stroke)}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const order: Outcome[] = ['affected', 'carrier', 'unaffected'];

function Row({ chances, condition, heading }: { chances: Chances; condition: string; heading?: string }) {
  const t = useTranslations('assistant.risk');
  const format = useFormatter();
  // Four children illustrate quarters; every engine result is a multiple of 25.
  const figures = order.flatMap((o) => Array.from({ length: Math.round(chances[o] / 25) }, () => o));
  const shown = order.filter((o) => chances[o] > 0);
  return (
    <div className="flex flex-col gap-3">
      {heading ? <p className="text-sm font-bold">{heading}</p> : null}
      {figures.length === 4 ? (
        <div className="flex gap-2" aria-hidden="true">
          {figures.map((o, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Figure outcome={o} />
              <span className={cn('text-[11px] font-semibold', figureStyle[o].text)}>{t(`figure.${o}`)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {shown.map((o) => (
          <li key={o} className="flex items-baseline gap-2">
            <span className={cn('min-w-12 text-lg font-extrabold tabular-nums', figureStyle[o].text)}>
              {format.number(chances[o] / 100, { style: 'percent' })}
            </span>
            <span className="text-sm">{o === 'affected' ? t('affected', { condition }) : t(o)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The 25/50/25 visual for an inheritance engine result (same figures and
 * colours as the Couple view). Never animated: risk numbers stay still.
 */
export function RiskVisual({ result, condition }: { result: InheritanceResult; condition?: string }) {
  const t = useTranslations('assistant.risk');
  const name = condition ?? t('generic');
  return (
    <figure className="flex flex-col gap-3 rounded-tile border border-line bg-surface p-4">
      <figcaption className="text-xs font-bold tracking-wide text-muted uppercase">{t('title')}</figcaption>
      {result.bySex ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
          <Row chances={result.bySex.son} condition={name} heading={t('son')} />
          <Row chances={result.bySex.daughter} condition={name} heading={t('daughter')} />
        </div>
      ) : (
        <Row chances={result.chances} condition={name} />
      )}
      <p className="text-xs text-muted">{t('same')}</p>
    </figure>
  );
}
