import 'server-only';
import { cleanQuery, parsePlaces, type Place } from './places';

/**
 * Finds places by name, worldwide (docs/nearby-care.md). Called from our
 * server, so the person's IP address never reaches the provider. The query
 * is never logged or stored.
 *
 * [GEOCODER] is still to be chosen. The default is OpenStreetMap's Nominatim,
 * whose public server allows about one request a second and needs an
 * identifying User-Agent: fine for the demo, not for real traffic. Set
 * GEOCODER_URL to a Nominatim-compatible /search endpoint for production.
 */
const ENDPOINT = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function searchPlaces(query: unknown, opts: { locale: string; decimals: number }): Promise<Place[] | null> {
  const q = cleanQuery(query);
  if (!q) return [];
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', opts.locale === 'ar' ? 'ar,en' : 'en');
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': `GeneBridge/0.1 (+${SITE})`, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
      // Same text, same answer: cache on our server for a day (no user data in it).
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    return parsePlaces(await res.json(), opts.decimals);
  } catch {
    // Never log the query.
    return null;
  }
}
