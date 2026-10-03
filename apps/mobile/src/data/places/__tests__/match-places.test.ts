/**
 * The phone's place match, shared by every search box: keyboard spellings find local names, the
 * crew's ideas come before curated places, and a kind-of-place word answers when no name does.
 */
import { describe, expect, it } from '@jest/globals';

import { matchPlaces, type PlaceCandidate } from '../match-places';

function place(id: string, name: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    id,
    poiId: id,
    name,
    nameLocal: null,
    category: 'food',
    lat: -8.36,
    lng: 115.13,
    tags: [],
    source: 'curated',
    ...extra,
  };
}

const names = (rows: readonly PlaceCandidate[]) => rows.map((row) => row.name);

describe('matchPlaces', () => {
  it('finds accented names typed without accents', () => {
    const places = [
      place('a', 'Café Wayan'),
      place('b', 'Bánh Mì Phượng'),
      place('c', 'Cầu Rồng', { nameLocal: 'Đà Nẵng Dragon Bridge', category: 'other' }),
    ];
    expect(names(matchPlaces(places, 'cafe'))).toEqual(['Café Wayan']);
    expect(names(matchPlaces(places, 'banh mi'))).toEqual(['Bánh Mì Phượng']);
    expect(names(matchPlaces(places, 'da nang'))).toEqual(['Cầu Rồng']);
  });

  it('matches each word from the start of a word only', () => {
    expect(matchPlaces([place('a', 'Personal Trainer')], 'son')).toEqual([]);
  });

  it('puts the crew’s ideas before curated places, and lists a saved place once', () => {
    const curated = place('poi-1', 'Warung Babi Guling');
    const other = place('poi-2', 'Warung Dapur Desa');
    const idea = { ...other, id: 'idea-1', source: 'idea' as const };
    expect(
      matchPlaces([curated, other, idea], 'warung').map((row) => [row.name, row.source]),
    ).toEqual([
      ['Warung Dapur Desa', 'idea'],
      ['Warung Babi Guling', 'curated'],
    ]);
  });

  it('falls back to the kind of place when no name has every word', () => {
    const places = [
      place('a', 'Billy’s Terrace Cafe', { tags: ['coffee'] }),
      place('b', 'Kopi Sawah', { tags: ['coffee', 'rice field view'] }),
      place('c', 'Warung Dapur Desa'),
      place('d', 'Pura Luhur Batukaru', { category: 'temple_shrine' }),
    ];
    expect(names(matchPlaces(places, 'coffee near the terraces'))).toEqual([
      'Billy’s Terrace Cafe',
      'Kopi Sawah',
    ]);
    expect(names(matchPlaces(places, 'chùa'))).toEqual(['Pura Luhur Batukaru']);
  });

  it('answers nothing for an empty or stop-word-only query', () => {
    expect(matchPlaces([place('a', 'The Near')], '  ')).toEqual([]);
    expect(matchPlaces([place('a', 'The Near')], 'near the')).toEqual([]);
  });
});
