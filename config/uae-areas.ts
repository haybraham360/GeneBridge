/**
 * UAE areas for "Choose an area" (docs/nearby-care.md). Centre points are
 * public geography, rounded to 2 decimals (about 1 km), so an area search
 * works with no device location at all. Names are shown in the person's
 * language. Add areas here; ids are stored on practice_locations.area_id.
 */
export const emirates = ['abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'] as const;
export type Emirate = (typeof emirates)[number];

export type UaeArea = {
  id: string;
  emirate: Emirate;
  name: { en: string; ar: string };
  lat: number;
  lng: number;
};

export const uaeAreas: UaeArea[] = [
  { id: 'abu_dhabi_city', emirate: 'abu_dhabi', name: { en: 'Abu Dhabi city', ar: 'مدينة أبوظبي' }, lat: 24.47, lng: 54.37 },
  { id: 'khalifa_city', emirate: 'abu_dhabi', name: { en: 'Khalifa City', ar: 'مدينة خليفة' }, lat: 24.42, lng: 54.58 },
  { id: 'mussafah', emirate: 'abu_dhabi', name: { en: 'Mussafah', ar: 'مصفح' }, lat: 24.35, lng: 54.5 },
  { id: 'al_shamkha', emirate: 'abu_dhabi', name: { en: 'Al Shamkha', ar: 'الشامخة' }, lat: 24.39, lng: 54.71 },
  { id: 'al_ain', emirate: 'abu_dhabi', name: { en: 'Al Ain', ar: 'العين' }, lat: 24.21, lng: 55.74 },
  { id: 'madinat_zayed', emirate: 'abu_dhabi', name: { en: 'Madinat Zayed (Al Dhafra)', ar: 'مدينة زايد (الظفرة)' }, lat: 23.68, lng: 53.7 },
  { id: 'ruwais', emirate: 'abu_dhabi', name: { en: 'Ruwais (Al Dhafra)', ar: 'الرويس (الظفرة)' }, lat: 24.11, lng: 52.73 },
  { id: 'dubai_deira', emirate: 'dubai', name: { en: 'Deira, Dubai', ar: 'ديرة، دبي' }, lat: 25.27, lng: 55.31 },
  { id: 'dubai_jumeirah', emirate: 'dubai', name: { en: 'Jumeirah, Dubai', ar: 'جميرا، دبي' }, lat: 25.2, lng: 55.24 },
  { id: 'dubai_marina', emirate: 'dubai', name: { en: 'Dubai Marina', ar: 'دبي مارينا' }, lat: 25.08, lng: 55.14 },
  { id: 'sharjah_city', emirate: 'sharjah', name: { en: 'Sharjah city', ar: 'مدينة الشارقة' }, lat: 25.35, lng: 55.39 },
  { id: 'khor_fakkan', emirate: 'sharjah', name: { en: 'Khor Fakkan', ar: 'خورفكان' }, lat: 25.34, lng: 56.35 },
  { id: 'ajman_city', emirate: 'ajman', name: { en: 'Ajman', ar: 'عجمان' }, lat: 25.41, lng: 55.44 },
  { id: 'umm_al_quwain_city', emirate: 'umm_al_quwain', name: { en: 'Umm Al Quwain', ar: 'أم القيوين' }, lat: 25.56, lng: 55.55 },
  { id: 'ras_al_khaimah_city', emirate: 'ras_al_khaimah', name: { en: 'Ras Al Khaimah', ar: 'رأس الخيمة' }, lat: 25.79, lng: 55.94 },
  { id: 'fujairah_city', emirate: 'fujairah', name: { en: 'Fujairah', ar: 'الفجيرة' }, lat: 25.13, lng: 56.33 },
];

export function findArea(id: string | null | undefined): UaeArea | null {
  return uaeAreas.find((a) => a.id === id) ?? null;
}
