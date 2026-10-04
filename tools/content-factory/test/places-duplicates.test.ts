/**
 * Long features (beaches, mountains, parks) listed by several sources: their points can lie far
 * apart along the feature, so the same name or the same Wikidata item makes them one place, while
 * the next beach along the coast stays its own.
 */
import { describe, expect, it } from 'vitest';

import type { WikidataPoint } from '../src/kinds/media/place-match';
import {
  farNamesakes,
  landmarkNamesakes,
  longFeatureDuplicates,
  type DuplicatePlace,
} from '../src/kinds/places/duplicates';

const place = (
  ref: string,
  name: string,
  lat: number,
  lng: number,
  category = 'beach',
): DuplicatePlace => ({ ref, name, nameLocal: null, category, lat, lng });

// Points as the open data has them along Đà Nẵng's coast.
const MY_KHE = place('overture:my-khe', 'My Khe Beach', 16.0631, 108.2459);
const MY_KHE_VI = place('overture:my-khe-vi', 'Bãi Biển Mỹ Khê Đà Nẵng', 16.0567, 108.2469);
const MY_KHE_CITY = place('overture:my-khe-city', 'Mỹ Khê Beach, Đà Nẵng City', 16.0503, 108.2489);
const PHAM_VAN_DONG = place('overture:pvd', 'Bãi biển Phạm Văn Đồng', 16.0722, 108.2472);
const NON_NUOC = place('overture:non-nuoc', 'Bãi Tắm Non Nước', 16.0028, 108.27);
const NON_NUOC_MY_KHE = place('overture:nn-mk', 'Non Nước - My Khe Beach', 16.0814, 108.2471);
const MY_KHE_CAFE = place('fsq_os:cafe', 'My Khe Beach', 16.0611, 108.2462, 'food');

const myKheItem: WikidataPoint = {
  id: 'Q10796763',
  labels: ['My Khe Beach', 'Mỹ Khê', 'Bãi Tắm Mỹ Khê'],
  lat: 16.0703,
  lng: 108.2464,
};

describe('duplicates of long features', () => {
  it('merges one beach the sources name in two languages, into its shortest name', () => {
    const { merges } = longFeatureDuplicates(
      [MY_KHE_VI, MY_KHE, MY_KHE_CITY, PHAM_VAN_DONG, NON_NUOC, NON_NUOC_MY_KHE, MY_KHE_CAFE],
      [myKheItem],
    );
    expect(merges.map((m) => [m.from, m.into]).sort()).toEqual([
      ['overture:my-khe-city', 'overture:my-khe'],
      ['overture:my-khe-vi', 'overture:my-khe'],
    ]);
  });

  it('keeps the neighbouring beaches and a café of the same name apart', () => {
    const { merges, pairs } = longFeatureDuplicates(
      [MY_KHE, PHAM_VAN_DONG, NON_NUOC, NON_NUOC_MY_KHE, MY_KHE_CAFE],
      [myKheItem],
    );
    expect(merges).toEqual([]);
    expect(pairs).toEqual([]);
  });

  it('asks about two names of the same Wikidata item', () => {
    const peninsulaSide = place(
      'overture:st-mk',
      'Bán Đảo Sơn Trà - Biển Mỹ Khê',
      16.0548,
      108.2447,
    );
    const { merges, pairs } = longFeatureDuplicates([MY_KHE, peninsulaSide], [myKheItem]);
    expect(merges).toEqual([]);
    expect(pairs.map((p) => [p.a.ref, p.b.ref])).toEqual([['overture:my-khe', 'overture:st-mk']]);
    expect(pairs[0]?.distanceM).toBeGreaterThan(900);
  });
});

describe('a curated place named after a landmark but far from it', () => {
  const pass: WikidataPoint = {
    id: 'Q1477078',
    labels: ['Hai Van Pass', 'Đèo Hải Vân', 'Hải Vân'],
    lat: 16.1875,
    lng: 108.1308,
  };
  const top = place('overture:top', 'Đỉnh đèo Hải Vân', 16.1872, 108.1308, 'nature');
  const sonTra: WikidataPoint = {
    id: 'Q7560606',
    labels: ['Sơn Trà Mountain', 'Núi Sơn Trà', 'bán đảo Sơn Trà'],
    lat: 16.1239,
    lng: 108.2786,
  };
  const peak = place('fsq_os:peak', 'Đỉnh Bàn Cờ-Núi Sơn Trà', 16.1189, 108.2721, 'nature');

  it("merges into the landmark's place, unless pinned or on the landmark's ground", () => {
    const merges = farNamesakes(
      [
        top,
        peak,
        // An open-data record of the pass with a point in the city, 13 km away.
        place('fsq_os:city-pass', 'Hải Vân pass', 16.0711, 108.2091, 'nature'),
        // The peninsula's west coast, 3.6 km from the mountain's point.
        place('overture:west', 'Bán đảo Sơn Trà - Đà Nẵng', 16.1057, 108.2466, 'museum'),
        // A pagoda on the Marble Mountains whose name ends in Sơn Trà is not the mountain.
        place('overture:pagoda', 'Chùa Linh Ứng – Sơn Trà', 16.0041, 108.2643, 'temple_shrine'),
        place('overture:pinned-pass', 'Hai Van Pass', 16.0711, 108.2091, 'museum'),
      ],
      [
        { item: pass, ref: 'overture:top' },
        { item: sonTra, ref: 'fsq_os:peak' },
      ],
      new Set(['overture:pinned-pass']),
    );
    expect(merges).toEqual([{ from: 'fsq_os:city-pass', into: 'overture:top' }]);
  });
});

describe("records carrying a landmark's name on its ground", () => {
  const lake: WikidataPoint = {
    id: 'Q10772055',
    labels: ['Xuan Huong Lake', 'Hồ Xuân Hương'],
    lat: 11.9418,
    lng: 108.4468,
  };
  const own = place('overture:lake', 'Hồ Xuân Hương Đà Lạt', 11.943, 108.448, 'nature');

  it("pairs each with the landmark's place, leaving pinned places and businesses alone", () => {
    const pairs = landmarkNamesakes(
      [
        own,
        place('overture:tour', 'Du lịch Hồ Xuân Hương - Đà Lạt', 11.944, 108.45, 'museum'),
        place('fsq_os:lake-en', 'Hồ Xuân Hương (Xuan Huong Lake)', 11.941, 108.439, 'nature'),
        place('overture:pinned', 'Xuan Huong Lake', 11.942, 108.447, 'nature'),
        place('overture:cafe', 'Cafe Thanh Thuỷ Lake Xuân Hương', 11.942, 108.439, 'food'),
        place('overture:park', 'Công Viên Xuân Hương', 11.94, 108.439, 'nature'),
      ],
      [{ item: lake, ref: own.ref }],
      new Set(['overture:pinned']),
    );
    expect(pairs.map((pair) => [pair.a.ref, pair.b.ref])).toEqual([
      ['overture:lake', 'overture:tour'],
      ['overture:lake', 'fsq_os:lake-en'],
    ]);
  });
});
