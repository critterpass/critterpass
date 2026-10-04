/**
 * Đà Nẵng's and Đà Lạt's landmarks on recorded Wikidata responses (test/fixtures/places-landmarks),
 * and the place each one is among the open-data records near it, as the staging import has them.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SourceHttp } from '../src/kinds/media/http';
import {
  namePattern,
  pickLandmarkPlaces,
  widened,
  wikidataLandmarks,
  type Landmark,
  type LandmarkCandidate,
} from '../src/kinds/places/landmarks';

const http: SourceHttp = {
  fetch: () => Promise.reject(new Error('the recorded response covers the request')),
  cacheDir: path.join(import.meta.dirname, 'fixtures', 'places-landmarks'),
  now: () => Date.parse('2026-10-04T13:00:00Z'),
};

const DA_NANG = { south: 15.84, west: 107.95, north: 16.21, east: 108.36 };
const DA_LAT = { south: 11.8675, west: 108.3632, north: 12.013, east: 108.5119 };

const poi = (
  id: string,
  name: string,
  category: string,
  lat: number,
  lng: number,
  editorial = false,
): LandmarkCandidate => ({ id, name, category, lat, lng, editorial });

describe("a destination's landmarks", () => {
  it('lists World Heritage sites first, then the sights most written about, typed', async () => {
    const landmarks = await wikidataLandmarks(http, widened(DA_NANG), 'vi');
    expect(landmarks[0]).toMatchObject({
      id: 'Q391406',
      worldHeritage: true,
      category: 'temple_shrine',
      nameLocal: 'Thánh địa Mỹ Sơn',
    });
    const byName = new Map(landmarks.map((l) => [l.name, l.category]));
    expect(byName.get('Golden Bridge')).toBe('other');
    expect(byName.get('Hai Van Pass')).toBe('nature');
    expect(byName.get('Museum of Cham Sculpture')).toBe('museum');
    expect(byName.get('My Khe Beach')).toBe('beach');
    // Universities, stadiums, the airport and the city itself are not sights.
    expect(
      [...byName.keys()].some((name) => /University|Stadium|Airport|Hội An$/u.test(name)),
    ).toBe(false);
  });

  it('finds the place each landmark is, curated before imported, never a café of its name', async () => {
    const landmarks = await wikidataLandmarks(http, widened(DA_NANG), 'vi');
    const pick = (name: string, candidates: LandmarkCandidate[]) =>
      pickLandmarkPlaces(
        landmarks.filter((l: Landmark) => l.name === name),
        candidates,
      ).map((p) => p.poiId);

    expect(
      pick('Golden Bridge', [
        poi('cau-vang', 'Cầu Vàng', 'museum', 15.9969, 107.9973, true),
        poi('golden', 'Golden Bridge', 'other', 15.9947, 107.9966, true),
        poi('chinese', '峴港黃金橋', 'museum', 15.9951, 107.9962),
      ]),
    ).toEqual(['golden']);
    expect(
      pick('Dragon River Bridge', [
        poi('cafe', 'Cafe Cầu Rồng', 'food', 16.0606, 108.216),
        poi('hotel', 'CẦU RỒNg Hotel', 'stay', 16.0635, 108.2395),
        poi('auto', 'Cầu Rồng', 'other', 16.0611, 108.2276),
        poi('curated', 'Dragon Bridge', 'other', 16.0611, 108.2277, true),
      ]),
    ).toEqual(['curated']);
    expect(
      pick('Hai Van Pass', [
        poi('city', 'Hải Vân pass', 'nature', 16.0711, 108.2091, true),
        poi('top', 'Hai Van Pass', 'museum', 16.1877, 108.1313, true),
      ]),
    ).toEqual(['top']);
    // The sanctuary lies outside the import; same-named shops in the city are not it.
    expect(
      pick('Mỹ Sơn', [
        poi('cafe', 'Café Mỹ Sơn', 'food', 15.8796, 108.3053),
        poi('shop', 'Di sản Văn hóa Thế Giới Mỹ Sơn', 'other', 16.0678, 108.221),
      ]),
    ).toEqual([]);
  });
});

describe('a landmark named in part of a place name', () => {
  it('goes to the place it names whole, not a statue whose name ends in it', async () => {
    const landmarks = await wikidataLandmarks(http, widened(DA_NANG), 'vi');
    const picks = pickLandmarkPlaces(
      landmarks.filter((l) => l.name === 'Bà Nà Hills'),
      [
        poi('statue', 'Thích Ca Phật Đài - Bà Nà', 'temple_shrine', 15.9975, 107.994, true),
        poi('hills', 'Bà Nà Hill, Đà Nẵng, Việt Nam', 'other', 15.9977, 107.9877),
      ],
    );
    expect(picks).toEqual([expect.objectContaining({ poiId: 'hills', wholeName: true })]);
  });

  it('finds a curated place whose name is only place types and the town, by the whole label', async () => {
    const [bridge] = (await wikidataLandmarks(http, widened(DA_NANG), 'vi')).filter(
      (l) => l.id === 'Q1091054',
    );
    expect(bridge).toBeDefined();
    if (bridge === undefined) return;
    const pattern = new RegExp((namePattern(bridge) ?? '').replace(/\\[mM]/gu, '\\b'), 'u');
    expect(pattern.test('chua cau - hoi an - quang nam')).toBe(true);
    expect(
      pickLandmarkPlaces(
        [bridge],
        [
          poi('auto', 'Chùa Cầu (Japanese Covered Bridge)', 'other', 15.877, 108.3261),
          poi('curated', 'Chùa Cầu - Hội An - Quảng Nam', 'temple_shrine', 15.8769, 108.3262, true),
        ],
      ).map((p) => p.poiId),
    ).toEqual(['curated']);
  });
});

describe('a town few Wikipedias write about', () => {
  it('takes its sights from two sitelinks, while a city with enough keeps to seven', async () => {
    const town = await wikidataLandmarks(http, widened(DA_LAT), 'vi');
    const byName = new Map(town.map((l) => [l.name, l]));
    expect(byName.get('Tuyền Lâm Lake')).toMatchObject({ category: 'nature', sitelinks: 4 });
    expect(byName.get('Datanla falls')?.category).toBe('nature');
    expect(byName.get('Đà Lạt market')?.category).toBe('market');
    // The Pongour falls, a day trip 20 km beyond the town's box.
    expect(byName.get('Pongour Waterfall')?.nameLocal).toBe('Thác Pongour');
    // Rivers, the university and the airport are not sights.
    expect(town.some((l) => /River|University|Airport/u.test(l.name))).toBe(false);

    const city = await wikidataLandmarks(http, widened(DA_NANG), 'vi');
    expect(city.every((l) => l.worldHeritage || l.sitelinks >= 7)).toBe(true);
  });

  it('keeps a waterfall and a ward apart from the church of their name, and reads Dalat as Đà Lạt', async () => {
    const town = await wikidataLandmarks(http, widened(DA_LAT), 'vi');
    const pick = (name: string, candidates: LandmarkCandidate[]) =>
      pickLandmarkPlaces(
        town.filter((l: Landmark) => l.name === name),
        candidates,
      ).map((p) => p.poiId);
    expect(
      pick('Cam Ly Church', [
        poi('falls', 'Cam Ly Waterfall', 'museum', 11.942, 108.421),
        poi('ward', 'Phường Cam Ly - Đà Lạt', 'other', 11.943, 108.429),
      ]),
    ).toEqual([]);
    expect(
      pick('Đà Lạt market', [
        poi('far', 'CHỢ ĐÀ LẠT', 'market', 11.937, 108.445),
        poi('market', 'Dalat Market', 'market', 11.9426, 108.437),
      ]),
    ).toEqual(['market']);
  });
});
