import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDirectory } from '@/lib/directory/server';
import type { ServiceItem, ServiceType } from '@/lib/services/types';
import type { UserPathInfo } from '@/lib/user/path';
import { coarsen, type Point } from './geo';
import type { NearbyProfessional, NearbyResult, NearbyService } from './types';

type ProRow = {
  user_id: string;
  label: string;
  address_en: string | null;
  address_ar: string | null;
  area_id: string | null;
  lat: number;
  lng: number;
  distance_km: number | string;
};

type ServiceRow = {
  name: string;
  kind: string;
  area: string | null;
  languages: string[] | null;
  description_en: string | null;
  description_ar: string | null;
  coverage: ServiceItem['coverage'] | null;
  women_only: boolean | null;
  phone: string | null;
  address_en: string | null;
  address_ar: string | null;
  lat: number;
  lng: number;
  distance_km: number | string;
};

const specialist = new Set(['haematology', 'neuromuscular', 'audiology', 'metabolic']);

function failure(message: string | undefined): NearbyResult {
  if (message?.includes('rate_limited')) return { status: 'rate_limited' };
  if (message?.includes('bad_radius') || message?.includes('bad_point')) return { status: 'invalid' };
  return { status: 'error' };
}

/**
 * Verified professionals and services near a point (docs/nearby-care.md).
 * The point is rounded again here and in the database; it is passed to two
 * functions and dropped. Professional details come from the existing
 * directory, so only bookable professionals appear (guardrail 15).
 */
export async function searchNearby(
  supabase: SupabaseClient,
  input: { point: Point; radiusKm: number; locale: 'ar' | 'en'; language: string; path: UserPathInfo },
): Promise<NearbyResult> {
  const { lat, lng } = coarsen(input.point);
  const args = { p_lat: lat, p_lng: lng, p_radius_km: input.radiusKm };
  const [pros, services] = await Promise.all([
    supabase.rpc('nearby_professionals', args),
    supabase.rpc('nearby_services', args),
  ]);
  if (pros.error || services.error) return failure(pros.error?.message ?? services.error?.message);

  const proRows = (pros.data ?? []) as ProRow[];
  const directory = proRows.length ? await loadDirectory(supabase, { language: input.language, path: input.path }) : [];
  const byId = new Map(directory.map((e) => [e.userId, e]));

  const professionals: NearbyProfessional[] = [];
  for (const r of proRows) {
    const entry = byId.get(r.user_id);
    if (!entry) continue;
    professionals.push({
      ...entry,
      distanceKm: Number(r.distance_km),
      locationLabel: r.label,
      address: (input.locale === 'ar' ? r.address_ar : r.address_en) ?? r.address_en ?? r.address_ar,
      areaId: r.area_id,
      point: { lat: r.lat, lng: r.lng },
    });
  }
  // Nearest first; the directory's own order breaks ties.
  const rank = new Map(directory.map((e, i) => [e.userId, i]));
  professionals.sort((a, b) => a.distanceKm - b.distanceKm || (rank.get(a.userId) ?? 0) - (rank.get(b.userId) ?? 0));

  const serviceList: NearbyService[] = ((services.data ?? []) as ServiceRow[]).map((r) => ({
    name: r.name,
    kind: r.kind,
    type: (specialist.has(r.kind) ? 'specialist' : r.kind) as ServiceType,
    description: (input.locale === 'ar' ? r.description_ar : r.description_en) ?? null,
    area: r.area,
    languages: r.languages ?? [],
    coverage: r.coverage ?? 'details',
    womenOnly: r.women_only ?? false,
    phone: r.phone ?? '[CONFIRM]',
    distanceKm: Number(r.distance_km),
    address: (input.locale === 'ar' ? r.address_ar : r.address_en) ?? null,
    point: { lat: r.lat, lng: r.lng },
  }));

  return { status: 'ok', professionals, services: serviceList, radiusKm: input.radiusKm };
}
