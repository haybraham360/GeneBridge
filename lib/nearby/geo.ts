/**
 * Location helpers for nearby care (docs/nearby-care.md). Pure, so they are
 * unit-tested and run in the browser and on the server.
 *
 * The browser rounds a device location with coarsen() before it leaves the
 * device; the server and the database round again.
 */
export type Point = { lat: number; lng: number };

export const radiusOptions = [5, 10, 25, 50, 100] as const;
export type RadiusKm = (typeof radiusOptions)[number];

/** Rounds to 2 decimals (about 1 km). Precise coordinates never leave the device. */
export function coarsen(p: Point): Point {
  return { lat: round2(p.lat), lng: round2(p.lng) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isFinitePoint(p: unknown): p is Point {
  const v = p as Partial<Point> | null;
  return typeof v?.lat === 'number' && typeof v?.lng === 'number' && Number.isFinite(v.lat) && Number.isFinite(v.lng);
}

/** Any real point on Earth. Matches the database checks. */
export function isValidPoint(p: unknown): p is Point {
  return isFinitePoint(p) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}

/** Great-circle distance in km (same formula as nearby_private.km). */
export function haversineKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Analytics bucket for a distance. Never the distance itself. */
export function distanceBand(km: number): 'lt5' | '5to10' | '10to25' | '25plus' {
  if (km < 5) return 'lt5';
  if (km < 10) return '5to10';
  if (km < 25) return '10to25';
  return '25plus';
}

export function isRadius(n: unknown): n is RadiusKm {
  return (radiusOptions as readonly unknown[]).includes(n);
}

/**
 * "lat, lng" as pasted from a map app (for a professional's practice
 * location). Returns null unless it is a valid point.
 */
export function parsePoint(text: string): Point | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const p = { lat: Number(m[1]), lng: Number(m[2]) };
  return isValidPoint(p) ? p : null;
}

/**
 * A directions link with the destination only. The map app finds the
 * person's own position itself; GeneBridge never sends it.
 */
export function directionsUrl(destination: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;
}
