/**
 * Place search results (docs/nearby-care.md). Pure, so it is unit-tested;
 * the network call is in geocode.ts (server only).
 */
import { isValidPoint, type Point } from './geo';

export type Place = {
  /** Short name to show, e.g. "Khalifa City, Abu Dhabi, United Arab Emirates". */
  label: string;
  point: Point;
  /** ISO 3166-1 alpha-2, upper case, when known. */
  countryCode: string | null;
};

type NominatimRow = {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
  address?: { country_code?: unknown } | null;
};

/** Rounds to `decimals` places. */
export function roundPoint(p: Point, decimals: number): Point {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

/**
 * Turns a Nominatim-style JSON response into places. Drops anything without
 * a valid point, removes duplicates and keeps at most 5. Long display names
 * are shortened to their first four parts.
 */
export function parsePlaces(json: unknown, decimals: number): Place[] {
  if (!Array.isArray(json)) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const row of json as NominatimRow[]) {
    const point = { lat: Number(row?.lat), lng: Number(row?.lon) };
    if (!isValidPoint(point) || typeof row.display_name !== 'string') continue;
    const label = row.display_name
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(', ')
      .slice(0, 160);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const cc = typeof row.address?.country_code === 'string' ? row.address.country_code.toUpperCase() : null;
    out.push({ label, point: roundPoint(point, decimals), countryCode: cc && /^[A-Z]{2}$/.test(cc) ? cc : null });
    if (out.length === 5) break;
  }
  return out;
}

/** A search the server will send: trimmed, 2 to 120 characters. */
export function cleanQuery(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const s = q.replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 120 ? s : null;
}
