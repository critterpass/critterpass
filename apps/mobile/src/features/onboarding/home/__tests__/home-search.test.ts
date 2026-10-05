import { describe, expect, it } from '@jest/globals';
import type { GeoHint } from '@cp/domain';

import { airportDataset } from '../../content';
import { HOME_ROWS, homeResults, readerCountryOf, type HomeRow } from '../home-search';

const SINGAPORE: GeoHint = {
  country: 'SG',
  city: 'Singapore',
  point: { lat: 1.3, lng: 103.8 },
  nearest_iata: ['SIN'],
};

const HO_CHI_MINH: GeoHint = {
  country: 'VN',
  city: 'Ho Chi Minh City',
  point: { lat: 10.8, lng: 106.7 },
  nearest_iata: ['SGN'],
};

const codes = (rows: readonly HomeRow[]) =>
  rows.map((row) => (row.kind === 'metro' ? row.metro.iata : row.airport.iata));

const search = (query: string, hint: GeoHint | null = null) =>
  homeResults(airportDataset(), query, hint);

describe('home airport ranking over the bundled airports', () => {
  it('lists Singapore, then its other airport, then the nearby one across the border', () => {
    const { rows } = search('Sing', SINGAPORE);
    expect(codes(rows)).toEqual(['SIN', 'XSP', 'JHB']);
    const johor = rows[2];
    expect(johor?.kind === 'airport' && johor.driveMinutes).toBeGreaterThan(0);
    // Home's own airports print the currency, not a drive.
    expect(rows.slice(0, 2).map((row) => row.kind === 'airport' && row.driveMinutes)).toEqual([
      null,
      null,
    ]);
  });

  it('puts the city and country prefixes above name-only matches without a hint', () => {
    const top = codes(search('Sing').rows);
    expect(top.slice(0, 2)).toEqual(['SIN', 'XSP']);
    expect(top).not.toContain('IXC');
    expect(top).not.toContain('SXM');
  });

  it('keeps an exact code first', () => {
    expect(codes(search('SGN').rows)[0]).toBe('SGN');
    expect(codes(search('sgn', SINGAPORE).rows)[0]).toBe('SGN');
  });

  it('finds a city by its first words', () => {
    expect(codes(search('Ho Chi').rows)[0]).toBe('SGN');
    expect(codes(search('ho chi', HO_CHI_MINH).rows)[0]).toBe('SGN');
  });

  it('matches Hanoi with or without diacritics and spaces', () => {
    for (const query of ['Hà Nội', 'Ha Noi', 'hanoi', 'HÀ NỘI']) {
      expect(codes(search(query).rows)[0]).toBe('HAN');
    }
  });

  it('does not pad a far-away city with the hint’s own airports', () => {
    const top = codes(search('Tokyo', SINGAPORE).rows);
    expect(top).toContain('HND');
    expect(top).toContain('TYO');
    expect(top).not.toContain('SIN');
    expect(top).not.toContain('JHB');
  });

  it('shows the hint’s nearest airports by distance for an empty query', () => {
    const { rows, farMinutes } = search('', SINGAPORE);
    expect(codes(rows)).toEqual(['XSP', 'SIN', 'JHB']);
    expect(farMinutes).toBeNull();
    expect(search('  ').rows).toEqual([]);
  });

  it('caps the list so the stamp fits below it', () => {
    expect(search('San').rows).toHaveLength(HOME_ROWS);
    expect(homeResults(airportDataset(), 'San', null, 6).rows).toHaveLength(6);
  });
});

describe('a reader whose language names a country', () => {
  const IOWA: GeoHint = {
    country: 'US',
    city: 'Des Moines',
    point: { lat: 41.6, lng: -93.6 },
    nearest_iata: ['DSM'],
  };
  const vi = readerCountryOf('vi');

  it('shows only what matches the city she typed, never a look-alike', () => {
    const rows = codes(homeResults(airportDataset(), 'Ho Chi', IOWA, HOME_ROWS, vi).rows);
    expect(rows[0]).toBe('SGN');
    expect(rows).not.toContain('HCJ');
  });

  it('still offers a look-alike when nothing matches as typed', () => {
    expect(codes(search('Changy').rows).length).toBeGreaterThan(0);
  });

  it('leads with her country’s main airports before typing when the phone gave no position', () => {
    const rows = homeResults(airportDataset(), '', null, HOME_ROWS, vi).rows;
    expect(rows).toHaveLength(HOME_ROWS);
    expect(rows.every((row) => row.kind === 'airport' && row.airport.country === 'VN')).toBe(true);
    expect(codes(rows)).toEqual(['SGN', 'HAN', 'DAD']);
    // A real position keeps its own nearest airports.
    expect(codes(homeResults(airportDataset(), '', IOWA, HOME_ROWS, vi).rows)).toContain('DSM');
    expect(readerCountryOf('en')).toBeNull();
  });
});
