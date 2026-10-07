import { critters, isGuideSpec } from '@cp/critter-art';
import { describe, expect, it } from 'vitest';

import { CITY_TICKER, GUIDES } from './guides';
import { HATCH_POOL } from './hatch-pool';
import { SITE_LOCALE_CODES } from './locale';
import { placeRows, resolveDestination } from './place-catalogue';
import { knownPlaceNames, placeName, placeNameUpper } from './place-names';
import { indexPlaces, searchPlaces } from './place-search';
import { DESTINATIONS } from './waitlist';

describe('destination keys the join endpoint accepts', () => {
  it('accepts each of the six chips, with its own guide', () => {
    for (const destination of DESTINATIONS) {
      const view = resolveDestination(destination.key, 'en');
      expect(view?.destinationKey).toBe(destination.key);
      expect(view?.kind).toBe(destination.kind);
      expect(view?.role).toBe('guide');
    }
  });

  it('accepts a catalogue city and draws its local', () => {
    expect(resolveDestination('cp-005', 'en')).toMatchObject({
      destinationKey: 'cp-005',
      role: 'local',
      name: 'CHÉP',
      city: 'HỘI AN',
      place: 'Hội An',
      kind: 'cp-005',
      no: '005',
    });
  });

  it('accepts an airport city, with Tokek as guest guide and the city from the data', () => {
    const row = placeRows('en').find(
      (entry) => entry[0].startsWith('apt-') && entry[1] === 'Zanzibar',
    );
    expect(row).toBeDefined();
    expect(resolveDestination(row?.[0] ?? '', 'en')).toMatchObject({
      role: 'guide',
      name: 'TOKEK',
      kind: 'gecko',
      city: 'ZANZIBAR',
      place: 'Zanzibar',
    });
  });

  it.each(['', 'atlantis', 'cp-999', 'apt-zzz', 'apt-', 'BALI', '<b>x</b>', 'Hội An'])(
    'refuses %j',
    (key) => {
      expect(resolveDestination(key, 'en')).toBeNull();
    },
  );
});

describe('place rows', () => {
  const rows = placeRows('en');

  it('lists every catalogue city once, the six guide cities as their chips', () => {
    const catalogue = rows.filter((row) => row[3] === 0);
    expect(catalogue).toHaveLength(critters.length);
    const chipKeys = catalogue.map((row) => row[0]).filter((key) => !key.startsWith('cp-'));
    expect(chipKeys.sort()).toEqual(DESTINATIONS.map((destination) => destination.key).sort());
    expect(new Set(rows.map((row) => row[0])).size).toBe(rows.length);
  });

  it('names the guide of a city only where the guide is a public, hand-drawn one', () => {
    const publicNames = critters
      .filter((critter) => isGuideSpec(critter.spec))
      .map((critter) => critter.name);
    for (const locale of SITE_LOCALE_CODES) {
      const catalogue = placeRows(locale).filter((row) => row[3] === 0);
      const named = catalogue.map((row) => row[4]).filter((name) => name !== '');
      expect(named.sort(), locale).toEqual([...publicNames].sort());
      // Key, city, country, rank, guide and at most the city's original name: nothing else.
      expect(Math.max(...catalogue.map((row) => row.length)), locale).toBeLessThanOrEqual(6);
      const wire = JSON.stringify(catalogue);
      for (const critter of critters) {
        if (isGuideSpec(critter.spec) || critter.species === critter.city) continue;
        expect(wire, critter.species).not.toContain(`"${critter.species}"`);
      }
    }
  });

  it('adds airport cities the catalogue does not have, one row per city', () => {
    const airports = rows.filter((row) => row[3] !== 0);
    expect(airports.length).toBeGreaterThan(3000);
    // Paris and Hà Nội are catalogue cities: their airports do not add a second row.
    expect(airports.some((row) => row[1] === 'Paris' && row[2] === 'FR')).toBe(false);
    expect(airports.some((row) => row[1] === 'Hanoi' && row[2] === 'VN')).toBe(false);
    expect(airports.filter((row) => row[1] === 'Tokyo' && row[2] === 'JP')).toHaveLength(0);
    expect(airports.filter((row) => row[1] === 'Zanzibar')).toHaveLength(1);
    expect(airports.every((row) => row[1].trim() !== '')).toBe(true);
  });

  it('finds Đà Nẵng for "da nang" in the real list, catalogue row first', () => {
    const hits = searchPlaces(indexPlaces(rows), 'da nang');
    expect(hits[0]?.[0]).toBe('cp-151');
    expect(hits[0]?.[1]).toBe('Đà Nẵng');
  });

  it('stays small enough to fetch on first focus', () => {
    for (const locale of SITE_LOCALE_CODES) {
      const bytes = new TextEncoder().encode(JSON.stringify(placeRows(locale))).length;
      expect(bytes, locale).toBeLessThan(160 * 1024);
    }
  });
});

describe('place names', () => {
  it('names every catalogue city, guide place, ticker city and hatch city', () => {
    const known = new Set(knownPlaceNames().map((name) => name.toUpperCase()));
    const used = [
      ...critters.map((critter) => critter.city),
      ...GUIDES.map((guide) => guide.place),
      ...CITY_TICKER.map((entry) => entry.city),
      ...HATCH_POOL.map((local) => local.city),
    ];
    for (const name of used) expect(known.has(name.toUpperCase()), name).toBe(true);
  });

  it("uses a language's own name where it has one, the original otherwise", () => {
    expect(placeName('Kyoto', 'ja')).toBe('京都');
    expect(placeName('Kyoto', 'en')).toBe('Kyoto');
    expect(placeName('Seville', 'es')).toBe('Sevilla');
    expect(placeName('New York', 'es')).toBe('Nueva York');
    expect(placeName('Mexico City', 'vi')).toBe('Thành phố Mexico');
    expect(placeName('HỘI AN', 'en')).toBe('Hội An');
    expect(placeNameUpper('Hà Nội', 'vi')).toBe('HÀ NỘI');
    expect(placeNameUpper('Seville', 'fr')).toBe('SÉVILLE');
    expect(placeName('Zanzibar', 'ja')).toBe('Zanzibar');
  });

  it('lets a catalogue city be found by either name on a translated page', () => {
    const places = indexPlaces(placeRows('ja'));
    expect(searchPlaces(places, '京都')[0]?.[0]).toBe('kyoto');
    expect(searchPlaces(places, 'kyoto')[0]?.[0]).toBe('kyoto');
    expect(searchPlaces(places, 'ホイアン')[0]?.[0]).toBe('cp-005');
    expect(searchPlaces(places, 'hoi an')[0]?.[0]).toBe('cp-005');
    expect(resolveDestination('cp-005', 'ja')).toMatchObject({
      city: 'ホイアン',
      place: 'ホイアン',
    });
    expect(resolveDestination('kyoto', 'ja')).toMatchObject({ city: '京都', place: '京都' });
    expect(resolveDestination('iceland', 'es')).toMatchObject({ city: 'ISLANDIA' });
  });
});
