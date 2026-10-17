/**
 * A row nobody curated that is a curated place under its other name (the Vietnamese and the
 * English name of one craft village) is that place: the curated row stands for both.
 */
import { describe, expect, it } from 'vitest';

import { collapseSamePlaces, type DraftPoi } from '../../src/draft';
import { D, id } from './da-nang-fixture';

/** A row about `metres` north of the village pin. */
function row(n: number, name: string, metres: number, extra: Partial<DraftPoi> = {}): DraftPoi {
  return {
    ...D.linhUng,
    id: id(900 + n),
    name,
    category: 'other',
    lat: 15.8862 + metres / 111_000,
    lng: 108.3433,
    mustSee: false,
    ...extra,
  };
}

const curated = { area: 'Craft villages', prominence: 'local_favourite', blogCount: 2 } as const;

describe('a curated place under its other name', () => {
  it('is one place with the curated row, even when the other row is a must-see', () => {
    const village = row(1, 'Làng mộc Kim Bồng', 0, { ...curated, category: 'shopping' });
    const english = row(2, 'Kim Bong Carpentry Village', 124, { mustSee: true });
    const { kept, keptFor, mentions } = collapseSamePlaces([english, village]);
    expect(kept.map((poi) => poi.id)).toEqual([village.id]);
    expect(keptFor.get(english.id)).toBe(village.id);
    expect(mentions.get(village.id)).toBe(2);
  });

  it('needs the two words of a name in a row, the same spot and a curated side', () => {
    const village = row(1, 'Làng mộc Kim Bồng', 0, curated);
    // One word in common ("Kim"), across the river, or neither row curated: two places.
    expect(collapseSamePlaces([village, row(3, 'Kim Long Pagoda', 50)]).kept).toHaveLength(2);
    expect(
      collapseSamePlaces([village, row(2, 'Kim Bong Carpentry Village', 900)]).kept,
    ).toHaveLength(2);
    const plain = { area: null, prominence: null, blogCount: null };
    expect(
      collapseSamePlaces([{ ...village, ...plain }, row(2, 'Kim Bong Carpentry Village', 124)])
        .kept,
    ).toHaveLength(2);
  });

  it('never makes two curated places one through a third row', () => {
    const tower = row(1, 'Torre de Belém Riverside Fortress', 0, curated);
    const garden = row(2, 'Jardim Vasco Gama Riverside Park', 120, curated);
    const between = row(3, 'Torre Belém Jardim Vasco', 40);
    const { kept } = collapseSamePlaces([tower, garden, between]);
    expect(kept.map((poi) => poi.id).sort()).toEqual([tower.id, garden.id].sort());
  });
});
