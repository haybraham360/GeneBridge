import { cn } from '@/lib/cn';

export type Bar = {
  key: string;
  label: string;
  /** 0–100, share of the bar track to fill. Null when the figure is hidden. */
  width: number | null;
  /** Formatted figure, or the "Hidden (under 10)" text. */
  value: string;
  /** Optional second line under the value, e.g. "% of previous step". */
  detail?: string | null;
  tone: 'ink' | 'brand';
};

/**
 * Plain HTML/CSS horizontal bars, as in the design. Bars grow from the start
 * edge, so they read right to left in Arabic. The bar shapes are decorative:
 * each row's label and value are real text, and the panel has a table view.
 * Colour never carries meaning on its own.
 */
export function BarList({ bars }: { bars: Bar[] }) {
  return (
    <div className="grid grid-cols-[minmax(110px,180px)_minmax(80px,1fr)_auto] items-center gap-x-3 gap-y-3.5 text-sm motion-safe:animate-fade-up">
      {bars.map((bar) => (
        <div key={bar.key} className="contents">
          <span className="font-semibold">{bar.label}</span>
          <span aria-hidden="true" className="h-5.5 overflow-hidden rounded-md bg-line/60">
            {bar.width !== null ? (
              <span
                className={cn(
                  'block h-full rounded-md',
                  bar.tone === 'ink' ? 'bg-ink' : 'bg-brand',
                )}
                // The only inline style: the bar length is data.
                style={{ inlineSize: `${Math.max(bar.width, bar.width > 0 ? 2 : 0)}%` }}
              />
            ) : null}
          </span>
          <span className="flex min-h-9 min-w-16 flex-col items-end justify-center text-end">
            <span className={cn('font-bold', bar.width === null && 'font-semibold text-muted')}>
              {bar.value}
            </span>
            {bar.detail ? <span className="text-xs text-muted">{bar.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
