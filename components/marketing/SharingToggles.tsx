'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export type SharingRow = {
  id: string;
  name: string;
  /** Shown while sharing is on. */
  onLevel: string;
  initiallyOn: boolean;
};

/**
 * "Who can see my result" demo. Each row is a real switch so visitors can try
 * turning sharing on and off. Nothing is saved: it is a landing-page preview.
 */
export function SharingToggles({ rows, offLevel }: { rows: SharingRow[]; offLevel: string }) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, row.initiallyOn])),
  );

  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((row) => {
        const on = state[row.id];
        return (
          <li key={row.id}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => setState((current) => ({ ...current, [row.id]: !current[row.id] }))}
              className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-input border border-line p-3 text-start transition-colors duration-200 hover:border-brand-ring hover:bg-brand-tint-soft"
            >
              <span>
                <span className="block text-sm font-bold">{row.name}</span>
                <span className="block text-[13px] text-muted">
                  {on ? row.onLevel : offLevel}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'relative inline-block h-[26px] w-11 shrink-0 rounded-full transition-colors duration-200',
                  on ? 'bg-ink' : 'bg-neutral-fill',
                )}
              >
                <span
                  className={cn(
                    'absolute start-[3px] top-[3px] size-5 rounded-full transition-[translate,background-color] duration-200',
                    on ? 'translate-x-[18px] bg-brand rtl:-translate-x-[18px]' : 'bg-white',
                  )}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
