import { describe, expect, it } from 'vitest';
import { findArea, uaeAreas } from '@/config/uae-areas';
import { coarsen, directionsUrl, distanceBand, haversineKm, isRadius, isValidPoint, parsePoint } from './geo';

describe('coarsen', () => {
  it('rounds to 2 decimals so nothing finer than about 1 km leaves the device', () => {
    expect(coarsen({ lat: 24.453884, lng: 54.377344 })).toEqual({ lat: 24.45, lng: 54.38 });
    const c = coarsen({ lat: 25.123456789, lng: 55.987654321 });
    expect(String(c.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    expect(String(c.lng).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 24.47, lng: 54.37 }, { lat: 24.47, lng: 54.37 })).toBe(0);
  });
  it('gives Abu Dhabi to Al Ain as roughly 140 km', () => {
    const d = haversineKm(findArea('abu_dhabi_city')!, findArea('al_ain')!);
    expect(d).toBeGreaterThan(130);
    expect(d).toBeLessThan(150);
  });
});

describe('isValidPoint', () => {
  it('accepts points anywhere in the world', () => {
    expect(isValidPoint({ lat: 24.47, lng: 54.37 })).toBe(true);
    expect(isValidPoint({ lat: 51.5, lng: -0.12 })).toBe(true);
    expect(isValidPoint({ lat: -33.87, lng: 151.21 })).toBe(true);
  });
  it('rejects impossible points', () => {
    expect(isValidPoint({ lat: 95, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidPoint({ lat: Number.NaN, lng: 0 })).toBe(false);
  });
  it('holds for every listed UAE area', () => {
    for (const a of uaeAreas) expect(isValidPoint(a)).toBe(true);
  });
});

describe('haversineKm worldwide', () => {
  it('gives London to Paris as roughly 340 km', () => {
    const d = haversineKm({ lat: 51.51, lng: -0.13 }, { lat: 48.86, lng: 2.35 });
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(350);
  });
  it('works across the date line', () => {
    expect(haversineKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeLessThan(30);
  });
});

describe('areas', () => {
  it('have unique ids and Arabic and English names', () => {
    expect(new Set(uaeAreas.map((a) => a.id)).size).toBe(uaeAreas.length);
    for (const a of uaeAreas) {
      expect(a.id).toMatch(/^[a-z0-9_]{2,40}$/);
      expect(a.name.en && a.name.ar).toBeTruthy();
    }
  });
});

describe('distanceBand', () => {
  it('buckets distances', () => {
    expect(distanceBand(0)).toBe('lt5');
    expect(distanceBand(7)).toBe('5to10');
    expect(distanceBand(10)).toBe('10to25');
    expect(distanceBand(80)).toBe('25plus');
  });
});

describe('isRadius', () => {
  it('allows only the offered radii', () => {
    expect(isRadius(25)).toBe(true);
    expect(isRadius(100)).toBe(true);
    expect(isRadius(500)).toBe(false);
    expect(isRadius('25')).toBe(false);
  });
});

describe('parsePoint', () => {
  it('reads a point pasted from a map app', () => {
    expect(parsePoint('24.4539, 54.3773')).toEqual({ lat: 24.4539, lng: 54.3773 });
    expect(parsePoint(' 25.2 55.27 ')).toEqual({ lat: 25.2, lng: 55.27 });
  });
  it('reads points anywhere in the world', () => {
    expect(parsePoint('51.5, -0.12')).toEqual({ lat: 51.5, lng: -0.12 });
    expect(parsePoint('-33.8688, 151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });
  it('rejects text and impossible points', () => {
    expect(parsePoint('Khalifa City')).toBeNull();
    expect(parsePoint('95, 10')).toBeNull();
  });
});

describe('directionsUrl', () => {
  it('carries the destination only', () => {
    const url = new URL(directionsUrl({ lat: 24.47, lng: 54.37 }));
    expect(url.searchParams.get('destination')).toBe('24.47,54.37');
    expect(url.searchParams.has('origin')).toBe(false);
  });
});
