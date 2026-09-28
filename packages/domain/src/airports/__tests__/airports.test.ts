import { describe, expect, it } from 'vitest';

import { isFarFromAirports, nearestAirports } from '../nearest';
import { foldForSearch, hitIata, searchAirports } from '../search';
import { homeBaseFor, type Airport, type AirportDataset } from '../types';

const a = (
  iata: string,
  name: string,
  city: string,
  country: string,
  lat: number,
  lng: number,
  rank: 1 | 2 | 3,
): Airport => ({ iata, name, city, country, lat, lng, rank });

const DATASET: AirportDataset = {
  airports: [
    a('JHB', 'Senai International Airport', 'Johor Bahru', 'MY', 1.64, 103.67, 2),
    a('XSP', 'Seletar Airport', 'Singapore', 'SG', 1.417, 103.868, 3),
    a('SIN', 'Singapore Changi Airport', 'Singapore', 'SG', 1.35, 103.99, 1),
    a('HAN', 'Noi Bai International Airport', 'Hà Nội', 'VN', 21.22, 105.81, 1),
    a('LHR', 'London Heathrow Airport', 'London', 'GB', 51.47, -0.45, 1),
    a('LGW', 'London Gatwick Airport', 'London', 'GB', 51.15, -0.19, 1),
    a('ZQN', 'Queenstown Airport', 'Queenstown', 'NZ', -45.02, 168.74, 2),
  ],
  countries: {
    SG: { iso3: 'SGP', currency: 'SGD', name: 'Singapore' },
    MY: { iso3: 'MYS', currency: 'MYR', name: 'Malaysia' },
    GB: { iso3: 'GBR', currency: 'GBP', name: 'United Kingdom' },
  },
  metros: [{ iata: 'LON', city: 'London', country: 'GB', airports: ['LHR', 'LGW'] }],
};

describe('searchAirports', () => {
  it.each(['Sing', 'sin', 'SIN', 'singapore'])('puts SIN first for %s', (query) => {
    expect(hitIata(searchAirports(DATASET, query)[0]!)).toBe('SIN');
  });

  it('matches cities without their diacritics and names by trigram', () => {
    expect(hitIata(searchAirports(DATASET, 'ha noi')[0]!)).toBe('HAN');
    expect(hitIata(searchAirports(DATASET, 'Changy')[0]!)).toBe('SIN');
    expect(foldForSearch('Đà Nẵng')).toBe('da nang');
  });

  it('matches a country name prefix and a city spelt without its spaces', () => {
    expect(hitIata(searchAirports(DATASET, 'Malay')[0]!)).toBe('JHB');
    expect(hitIata(searchAirports(DATASET, 'hanoi')[0]!)).toBe('HAN');
  });

  it('offers the metro group under a city', () => {
    const hits = searchAirports(DATASET, 'Lond').map(hitIata);
    expect(hits.slice(0, 3)).toEqual(['LGW', 'LHR', 'LON']);
    expect(hitIata(searchAirports(DATASET, 'LON')[0]!)).toBe('LON');
  });

  it('returns nothing for no match or an empty query', () => {
    expect(searchAirports(DATASET, 'zzzzqx')).toEqual([]);
    expect(searchAirports(DATASET, '  ')).toEqual([]);
  });
});

describe('nearestAirports', () => {
  it('sorts by distance with a drive estimate', () => {
    const near = nearestAirports(DATASET.airports, { lat: 1.3, lng: 103.85 }, 2);
    expect(near.map((n) => n.airport.iata)).toEqual(['SIN', 'JHB']);
    expect(near[1]!.driveMinutes).toBeGreaterThanOrEqual(30);
    expect(near[1]!.driveMinutes).toBeLessThanOrEqual(60);
    expect(isFarFromAirports(near)).toBe(false);
  });

  it('flags a point far from any airport', () => {
    const near = nearestAirports(DATASET.airports, { lat: -30, lng: 150 }, 1);
    expect(isFarFromAirports(near)).toBe(true);
  });
});

describe('homeBaseFor', () => {
  it('derives country, ISO3 and currency, metro groups included', () => {
    expect(homeBaseFor(DATASET, 'SIN')).toMatchObject({
      countryIso3: 'SGP',
      currency: 'SGD',
    });
    expect(homeBaseFor(DATASET, 'LON')?.city).toBe('London');
    expect(homeBaseFor(DATASET, 'ZQN')).toBeNull();
  });
});
