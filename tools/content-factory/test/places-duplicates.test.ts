/**
 * Long features (beaches, mountains, parks) listed by several sources: their points can lie far
 * apart along the feature, so the same name or the same Wikidata item makes them one place, while
 * the next beach along the coast stays its own.
 */
import { describe, expect, it } from 'vitest';

import type { WikidataPoint } from '../src/kinds/media/place-match';
import { longFeatureDuplicates, type DuplicatePlace } from '../src/kinds/places/duplicates';

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
