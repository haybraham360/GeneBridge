import type { AnalyticsRange, Filters } from './types';

export const ranges: readonly AnalyticsRange[] = ['30', '90', 'all'];
export const DEFAULT_RANGE: AnalyticsRange = '90';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the filters from the URL. Unknown ranges fall back to 90 days and
 * unknown centres to all centres, so the page never errors on a bad link.
 */
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
  centres: readonly string[],
): Filters {
  const range = first(params.range);
  const centre = first(params.centre);
  return {
    range: ranges.includes(range as AnalyticsRange) ? (range as AnalyticsRange) : DEFAULT_RANGE,
    centre: centre && centres.includes(centre) ? centre : null,
  };
}

/** The database functions take 30, 90 or null (all time). */
export function rangeDays(range: AnalyticsRange): 30 | 90 | null {
  return range === 'all' ? null : (Number(range) as 30 | 90);
}

/** Query string for a filter set, leaving defaults out. */
export function filtersQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_RANGE) params.set('range', filters.range);
  if (filters.centre) params.set('centre', filters.centre);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `genebridge-impact-<from>-<to>.csv`. "All time" has no fixed start, so
 * its <from> is `all-time`.
 */
export function exportFileName(range: AnalyticsRange, now = new Date()): string {
  const to = isoDate(now);
  const days = rangeDays(range);
  const from = days === null ? 'all-time' : isoDate(new Date(now.getTime() - days * 86_400_000));
  return `genebridge-impact-${from}-${to}.csv`;
}
