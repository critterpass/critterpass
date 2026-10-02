import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { COUNTRY_NAMES, hitIata, homeBaseFor, searchAirports, toCountryCode } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { airportDataset, airportZone } from './index';
import { AIRPORTS_FILE_BUDGET_BYTES, parseAirportDataset } from './schema';

const file = (name: string): unknown =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, name), 'utf8'));

describe('bundled airports', () => {
  it('validates fully and stays within the size budget', () => {
    const dataset = parseAirportDataset(file('airports.json'), file('metro-groups.json'));
    expect(dataset.airports.length).toBeGreaterThan(3000);
    expect(statSync(path.resolve(import.meta.dirname, 'airports.json')).size).toBeLessThan(
      AIRPORTS_FILE_BUDGET_BYTES,
    );
  });

  it('names every country the way the shared country reader knows it', () => {
    const { countries } = airportDataset();
    const names = Object.fromEntries(Object.entries(countries).map(([code, c]) => [code, c.name]));
    expect(names).toEqual(COUNTRY_NAMES);
    for (const [code, name] of Object.entries(names)) expect(toCountryCode(name)).toBe(code);
  });

  it('finds SIN first for Sing and sin, and derives the home', () => {
    const dataset = airportDataset();
    expect(hitIata(searchAirports(dataset, 'Sing')[0]!)).toBe('SIN');
    expect(hitIata(searchAirports(dataset, 'sin')[0]!)).toBe('SIN');
    expect(homeBaseFor(dataset, 'SIN')).toMatchObject({ countryIso3: 'SGP', currency: 'SGD' });
    expect(homeBaseFor(dataset, 'LON')).toMatchObject({ country: 'GB', currency: 'GBP' });
  });

  it('reads each airport on its own clock', () => {
    expect(airportZone('SGN')).toBe('Asia/Ho_Chi_Minh');
    expect(airportZone('dad')).toBe('Asia/Ho_Chi_Minh');
    expect(airportZone('DPS')).toBe('Asia/Makassar');
    expect(airportZone('PER')).toBe('Australia/Perth');
    expect(airportZone('ZZZ')).toBeNull();
  });
});
