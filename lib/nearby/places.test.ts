import { describe, expect, it } from 'vitest';
import { cleanQuery, parsePlaces, roundPoint } from './places';

const sample = [
  { lat: '53.4794892', lon: '-2.2451148', display_name: 'Manchester, Greater Manchester, England, United Kingdom', address: { country_code: 'gb' } },
  { lat: '53.4794892', lon: '-2.2451148', display_name: 'Manchester, Greater Manchester, England, United Kingdom', address: { country_code: 'gb' } },
  { lat: '24.4215', lon: '54.5776', display_name: 'Khalifa City, Abu Dhabi, Abu Dhabi Emirate, United Arab Emirates, 00000', address: { country_code: 'ae' } },
  { lat: 'x', lon: '1', display_name: 'Broken' },
  { lat: '91', lon: '1', display_name: 'Impossible' },
];

describe('parsePlaces', () => {
  it('keeps valid, unique places with rounded points and country codes', () => {
    const places = parsePlaces(sample, 2);
    expect(places).toEqual([
      { label: 'Manchester, Greater Manchester, England, United Kingdom', point: { lat: 53.48, lng: -2.25 }, countryCode: 'GB' },
      { label: 'Khalifa City, Abu Dhabi, Abu Dhabi Emirate, United Arab Emirates', point: { lat: 24.42, lng: 54.58 }, countryCode: 'AE' },
    ]);
  });
  it('keeps more precision for business addresses when asked', () => {
    expect(parsePlaces(sample, 4)[0].point).toEqual({ lat: 53.4795, lng: -2.2451 });
  });
  it('returns nothing for a response that is not a list', () => {
    expect(parsePlaces({ error: 'x' }, 2)).toEqual([]);
  });
  it('returns at most 5', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ lat: '10', lon: String(i), display_name: `Place ${i}` }));
    expect(parsePlaces(many, 2)).toHaveLength(5);
  });
});

describe('cleanQuery', () => {
  it('trims and limits length', () => {
    expect(cleanQuery('  Khalifa   City ')).toBe('Khalifa City');
    expect(cleanQuery('a')).toBeNull();
    expect(cleanQuery('x'.repeat(121))).toBeNull();
    expect(cleanQuery(42)).toBeNull();
  });
});

describe('roundPoint', () => {
  it('rounds both coordinates', () => {
    expect(roundPoint({ lat: 1.23456, lng: -9.87654 }, 2)).toEqual({ lat: 1.23, lng: -9.88 });
  });
});
