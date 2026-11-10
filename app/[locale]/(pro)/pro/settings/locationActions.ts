'use server';

/*
 * Practice locations (docs/nearby-care.md): where a professional sees
 * patients in person. Public business addresses, not personal data. Runs as
 * the signed-in professional; RLS limits every change to their own rows,
 * and patients only ever see them through nearby_professionals(), which
 * returns bookable (verified, accepting) professionals only.
 */
import { revalidatePath } from 'next/cache';
import { requireProfessionalAction } from '@/lib/kyc/server';
import { parsePoint } from '@/lib/nearby/geo';
import { searchPlaces } from '@/lib/nearby/geocode';
import type { Place } from '@/lib/nearby/places';

export type LocationInput = {
  label: string;
  addressEn: string;
  addressAr: string;
  /** "lat, lng": from "Find the address" or pasted from a map app. Anywhere in the world. */
  point: string;
  /** ISO country code from the address search, when known. */
  countryCode: string | null;
  showOnMap: boolean;
};

type Result = { status: 'ok' } | { status: 'invalid' | 'too_many' | 'error' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function toRow(input: LocationInput) {
  const label = clean(input?.label, 120);
  const point = parsePoint(clean(input?.point, 60));
  if (!label || !point) return null;
  const cc = typeof input.countryCode === 'string' ? input.countryCode.toUpperCase() : '';
  return {
    label,
    address_en: clean(input.addressEn, 240) || null,
    address_ar: clean(input.addressAr, 240) || null,
    // UAE areas and emirates were for the first, UAE-only version.
    area_id: null,
    emirate: null,
    country_code: /^[A-Z]{2}$/.test(cc) ? cc : null,
    lat: point.lat,
    lng: point.lng,
    show_on_map: input.showOnMap !== false,
  };
}

function refresh() {
  revalidatePath('/[locale]/pro/settings', 'page');
}

export async function addLocation(input: LocationInput): Promise<Result> {
  const { supabase, userId } = await requireProfessionalAction();
  const row = toRow(input);
  if (!row) return { status: 'invalid' };
  const { error } = await supabase.from('practice_locations').insert({ ...row, user_id: userId });
  if (error) return { status: error.message.includes('too_many_locations') ? 'too_many' : 'error' };
  refresh();
  return { status: 'ok' };
}

export async function updateLocation(id: string, input: LocationInput): Promise<Result> {
  const { supabase, userId } = await requireProfessionalAction();
  const row = toRow(input);
  if (!UUID.test(id) || !row) return { status: 'invalid' };
  const { error } = await supabase.from('practice_locations').update(row).eq('id', id).eq('user_id', userId);
  if (error) return { status: 'error' };
  refresh();
  return { status: 'ok' };
}

export async function removeLocation(id: string): Promise<Result> {
  const { supabase, userId } = await requireProfessionalAction();
  if (!UUID.test(id)) return { status: 'invalid' };
  const { error } = await supabase.from('practice_locations').delete().eq('id', id).eq('user_id', userId);
  if (error) return { status: 'error' };
  refresh();
  return { status: 'ok' };
}

/**
 * Finds a practice address anywhere in the world. Business addresses are
 * public, so points keep 4 decimals (about 10 m). The text is not stored.
 */
export async function findAddress(query: string, locale: string): Promise<{ status: 'ok'; places: Place[] } | { status: 'error' }> {
  await requireProfessionalAction();
  const places = await searchPlaces(query, { locale, decimals: 4 });
  return places ? { status: 'ok', places } : { status: 'error' };
}
