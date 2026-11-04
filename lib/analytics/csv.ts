/**
 * The "Export report" CSV. Built only from the aggregated figures already on
 * screen (DashboardData), so it can never contain row-level data. Hidden
 * figures are written as the same "Hidden (under 10)" text the page shows.
 */
export type CsvRow = readonly (string | number | null)[];

function cell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  // Neutralise spreadsheet formulas, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly CsvRow[]): string {
  // BOM so Excel opens Arabic text as UTF-8.
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
