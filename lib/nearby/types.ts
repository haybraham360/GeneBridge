import type { DirectoryEntry } from '@/lib/directory/sort';
import type { ServiceItem } from '@/lib/services/types';
import type { Point } from './geo';

/** A verified professional's closest in-person location to the search point. */
export type NearbyProfessional = DirectoryEntry & {
  distanceKm: number;
  locationLabel: string;
  address: string | null;
  areaId: string | null;
  point: Point;
};

export type NearbyService = ServiceItem & {
  kind: string;
  distanceKm: number;
  address: string | null;
  point: Point;
};

export type NearbyResult =
  | { status: 'ok'; professionals: NearbyProfessional[]; services: NearbyService[]; radiusKm: number }
  | { status: 'rate_limited' | 'invalid' | 'error' };
