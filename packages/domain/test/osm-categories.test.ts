import { describe, expect, it } from 'vitest';

import { classifyOsmTags } from '../src/places/osm-categories';

describe('classifyOsmTags', () => {
  it.each([
    [{ tourism: 'viewpoint', name: 'Bukit Campuhan' }, 'nature'],
    [{ natural: 'beach', name: 'Pantai Melasti' }, 'beach'],
    [{ natural: 'waterfall', name: 'Tegenungan' }, 'nature'],
    [{ waterway: 'waterfall', name: 'Tibumana' }, 'nature'],
    [{ amenity: 'place_of_worship', religion: 'buddhist', name: 'Kinkaku-ji' }, 'temple_shrine'],
    [{ historic: 'ruins', name: 'Sacsayhuamán' }, 'museum'],
    [{ amenity: 'marketplace', name: 'Chợ Hội An' }, 'market'],
    [{ leisure: 'park', name: 'Maruyama Park' }, 'nature'],
  ])('adds %j as a place in %s', (tags, category) => {
    expect(classifyOsmTags(tags)).toEqual({ category, kind: 'place' });
  });

  it('keeps businesses for hours only', () => {
    expect(classifyOsmTags({ amenity: 'cafe', name: 'Reaching Out Teahouse' })).toEqual({
      category: 'food',
      kind: 'hours_only',
    });
    expect(classifyOsmTags({ shop: 'books', name: 'Livraria Bertrand' })).toEqual({
      category: 'shopping',
      kind: 'hours_only',
    });
  });

  it('prefers the sight over the business on the same object', () => {
    expect(classifyOsmTags({ amenity: 'cafe', historic: 'castle', name: 'Castelo' })?.kind).toBe(
      'place',
    );
  });

  it('skips unnamed, private and unknown objects', () => {
    expect(classifyOsmTags({ natural: 'peak' })).toBeNull();
    expect(
      classifyOsmTags({ leisure: 'garden', access: 'private', name: 'Villa garden' }),
    ).toBeNull();
    expect(classifyOsmTags({ amenity: 'bench', name: 'Bench' })).toBeNull();
  });
});
