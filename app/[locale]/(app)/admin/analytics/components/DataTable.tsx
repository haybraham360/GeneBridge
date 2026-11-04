import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type DataTableProps = {
  caption: string;
  columns: string[];
  /** First cell of each row is the row header. */
  rows: { key: string; cells: ReactNode[] }[];
  minWidth?: string;
};

/**
 * Accessible table for dashboard figures. The first column holds row
 * headers; the rest are right-aligned numbers (left-aligned in Arabic).
 * Scrolls sideways on small screens and can be scrolled by keyboard.
 */
export function DataTable({ caption, columns, rows, minWidth = 'min-w-90' }: DataTableProps) {
  return (
    <div
      className="overflow-x-auto rounded-input focus-visible:outline-offset-2"
      // Focusable so keyboard users can scroll a table wider than the screen.
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className={cn('w-full border-collapse text-[15px]', minWidth)}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  'px-3 py-2 align-bottom text-[13px] font-bold text-muted',
                  i === 0 ? 'text-start' : 'text-end',
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              {row.cells.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="p-3 text-start font-bold">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="p-3 text-end tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
