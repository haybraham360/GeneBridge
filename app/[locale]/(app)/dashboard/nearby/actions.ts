'use server';

/*
 * Care near you (docs/nearby-care.md). Runs as the signed-in person. The
 * point is never stored, logged or sent anywhere but the two database
 * searches. Events carry the method and a distance band only.
 */
import { findArea } from '@/config/uae-areas';
import { logEvents } from '@/lib/auth/events';
import { coarsen, distanceBand, isRadius, isValidPoint, type Point } from '@/lib/nearby/geo';
import { searchPlaces } from '@/lib/nearby/geocode';
import type { Place } from '@/lib/nearby/places';
import { searchNearby } from '@/lib/nearby/server';
import type { NearbyResult } from '@/lib/nearby/types';
import { createClient, getAuthUser } from '@/lib/supabase/server';
import { loadUserPath } from '@/lib/user/path';

export type NearbyQuery =
  | { method: 'device' | 'place'; point: Point; radiusKm: number; locale: string }
  | { method: 'area'; areaId: string; radiusKm: number; locale: string };

export async function findNearby(query: NearbyQuery): Promise<NearbyResult> {
  if (!isRadius(query?.radiusKm)) return { status: 'invalid' };
  let point: Point | null = null;
  if ((query.method === 'device' || query.method === 'place') && isValidPoint(query.point)) point = coarsen(query.point);
  if (query.method === 'area') {
    const area = findArea(query.areaId);
    if (area) point = { lat: area.lat, lng: area.lng };
  }
  if (!point) return { status: 'invalid' };

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { status: 'error' };
  const locale = query.locale === 'en' ? 'en' : 'ar';
  const [path, profile] = await Promise.all([
    loadUserPath(supabase),
    supabase.from('profiles').select('locale').eq('user_id', user.id).maybeSingle(),
  ]);

  const result = await searchNearby(supabase, {
    point,
    radiusKm: query.radiusKm,
    locale,
    language: profile.data?.locale ?? locale,
    path,
  });

  const nearest = result.status === 'ok' ? result.professionals[0]?.distanceKm : undefined;
  await logEvents(supabase, user.id, [
    {
      name: 'nearby_location_method',
      props: {
        method: query.method,
        radius_km: query.radiusKm,
        nearest_band: nearest === undefined ? 'none' : distanceBand(nearest),
      },
    },
  ]);
  return result;
}

/** The person couldn't or chose not to share their location. */
export async function noteLocationDenied(): Promise<void> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (user) await logEvents(supabase, user.id, [{ name: 'nearby_location_method', props: { method: 'denied' } }]);
}

/** A result was opened. Type and distance band only, never who or where. */
export async function noteResultOpened(type: 'professional' | 'service', distanceKm: number): Promise<void> {
  if ((type !== 'professional' && type !== 'service') || !Number.isFinite(distanceKm)) return;
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (user) await logEvents(supabase, user.id, [{ name: 'nearby_result_opened', props: { type, distance_band: distanceBand(distanceKm) } }]);
}

// Best effort per server instance: place search is a convenience, and the
// provider has its own limits. 10 searches a minute per person.
const placeCalls = new Map<string, number[]>();

/**
 * Places matching what the person typed, anywhere in the world. Points come
 * back rounded to about 1 km. The text is sent from our server to the
 * geocoder and never logged or stored.
 */
export async function findPlaces(query: string, locale: string): Promise<{ status: 'ok'; places: Place[] } | { status: 'rate_limited' | 'error' }> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { status: 'error' };
  const now = Date.now();
  const recent = (placeCalls.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return { status: 'rate_limited' };
  placeCalls.set(user.id, [...recent, now]);

  const places = await searchPlaces(query, { locale, decimals: 2 });
  return places ? { status: 'ok', places } : { status: 'error' };
}
