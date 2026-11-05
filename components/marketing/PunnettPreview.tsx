'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

// Generic gene copies (any condition): A typical, a changed.
type Copy = 'A' | 'a';
type Cell = { row: Copy; col: Copy };

const copies: Copy[] = ['A', 'a'];

/** Genotypes are written with the typical copy first: AA, Aa, aa. */
function genotype(row: Copy, col: Copy) {
  return [row, col].sort().join('');
}

/**
 * Punnett square preview. Hovering or focusing a child cell highlights the
 * gene copy it inherits from each parent, so visitors can see where it comes
 * from. Genotype notation is always left-to-right, so the grid is pinned LTR.
 */
export function PunnettPreview({
  caption,
  parentA,
  parentB,
}: {
  caption: string;
  parentA: string;
  parentB: string;
}) {
  const [active, setActive] = useState<Cell | null>(null);

  const header = (on: boolean) =>
    cn('rounded-lg transition-colors duration-200', on ? 'bg-brand-tint text-brand-text-dark' : '');

  return (
    <table
      dir="ltr"
      onMouseLeave={() => setActive(null)}
      className="w-full table-fixed border-separate border-spacing-1.5 text-center text-[15px] font-bold"
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <td />
          {copies.map((col) => (
            <th key={col} scope="col" className={cn('p-2', header(active?.col === col))}>
              <span className="sr-only">{parentB}: </span>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {copies.map((row) => (
          <tr key={row}>
            <th scope="row" className={cn('py-3.5', header(active?.row === row))}>
              <span className="sr-only">{parentA}: </span>
              {row}
            </th>
            {copies.map((col) => {
              const value = genotype(row, col);
              const on = active?.row === row && active?.col === col;
              return (
                <td
                  key={col}
                  tabIndex={0}
                  onMouseEnter={() => setActive({ row, col })}
                  onFocus={() => setActive({ row, col })}
                  onBlur={() => setActive(null)}
                  className={cn(
                    'cursor-default rounded-lg py-3.5 transition-[scale,box-shadow] duration-200',
                    value === 'aa' ? 'bg-affected-tint' : 'bg-[#F7F2EE]',
                    on && 'scale-105 shadow-card',
                  )}
                >
                  {value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
