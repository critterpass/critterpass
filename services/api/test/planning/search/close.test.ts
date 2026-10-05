import type { SearchFilter } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { closeTo } from '../../../src/planning/search/close';
import { hardFilters, type Evaluated, type SoftMiss } from '../../../src/planning/search/evaluate';
import { kindNounMatcher, namedFirst } from '../../../src/planning/search/kind-nouns';

const place = (name: string, misses: SoftMiss[], tags: string[] = []): Evaluated => ({
  item: {
    id: name,
    name,
    nameLocal: null,
    category: 'food',
    lat: 0,
    lng: 0,
    address: null,
    area: null,
    recommended: false,
    priceLevel: null,
    tags,
    distanceM: null,
    openNow: null,
  },
  area: null,
  days: [],
  minutes: null,
  misses,
});

const names = (answer: { results: readonly Evaluated[] } | null) =>
  answer?.results.map((entry) => entry.item.name);
const never = () => Promise.reject(new Error('searched again'));

describe('close to an empty plain-words search', () => {
  const filter: SearchFilter = {
    meal: 'dinner',
    attributes: ['quiet'],
    open_past: '22:00',
    max_minutes: { from: 'stay', minutes: 15 },
  };

  it('drops the closing time first, without searching again', async () => {
    const answer = await closeTo(
      filter,
      [place('Unknown hours', ['open_past']), place('Loud', ['attribute', 'open_past'])],
      never,
    );
    expect(names(answer)).toEqual(['Unknown hours']);
    expect(answer?.dropped).toEqual(['open_past']);
  });

  it('drops one part alone when that is enough, else the weakest together', async () => {
    const far = await closeTo(filter, [place('Far', ['open_past', 'max_minutes'])], never);
    expect(far?.dropped).toEqual(['open_past', 'max_minutes']);
    const loud = await closeTo(filter, [place('Loud', ['attribute'])], never);
    expect(names(loud)).toEqual(['Loud']);
    expect(loud?.dropped).toEqual(['attribute']);
    const both = await closeTo(filter, [place('Loud and late', ['attribute', 'open_past'])], never);
    expect(both?.dropped).toEqual(['open_past', 'max_minutes', 'attribute']);
  });

  it('never names a part the search did not have', async () => {
    const answer = await closeTo(
      { meal: 'dinner', attributes: ['quiet'] },
      [place('Loud', ['attribute'])],
      never,
    );
    expect(answer?.dropped).toEqual(['attribute']);
  });

  it('drops the words only when no candidate is left, keeping the meal', async () => {
    const asked: SearchFilter[] = [];
    const answer = await closeTo(
      { text: 'omakase', meal: 'dinner', categories: ['beach'], open_past: '22:00' },
      [],
      (next) => {
        asked.push(next);
        return Promise.resolve(next.categories === undefined ? [place('Warung', [])] : []);
      },
    );
    expect(asked).toEqual([{ meal: 'dinner', categories: ['beach'] }, { meal: 'dinner' }]);
    expect(answer?.dropped).toEqual(['open_past', 'text', 'category']);
    expect(names(answer)).toEqual(['Warung']);
  });

  it('keeps the kind of place when it is all the search has left', async () => {
    const asked: SearchFilter[] = [];
    const answer = await closeTo({ text: 'quiet cove', categories: ['beach'] }, [], (next) => {
      asked.push(next);
      return Promise.resolve([]);
    });
    expect(asked).toEqual([{ categories: ['beach'] }]);
    expect(answer).toBeNull();
  });
});

describe('a meal with a kind of place nobody eats at', () => {
  it('looks in the meal’s kinds for places that mention the other', () => {
    expect(hardFilters({ meal: 'dinner', categories: ['beach'] })).toEqual({
      categories: ['food'],
      text: 'beach',
    });
  });

  it('keeps her own words, and a kind the meal is eaten at', () => {
    expect(hardFilters({ meal: 'dinner', categories: ['beach'], text: 'seafood' }).text).toBe(
      'seafood',
    );
    expect(hardFilters({ meal: 'drinks', categories: ['nightlife'] })).toEqual({
      categories: ['nightlife'],
      text: '',
    });
    expect(hardFilters({ categories: ['nature'] })).toEqual({ categories: ['nature'], text: '' });
  });
});

describe('the noun she typed', () => {
  it('puts places named or tagged for it first, each group in its own order', () => {
    const named = kindNounMatcher('a waterfall without the crowds, on Mon');
    expect(named).not.toBeNull();
    const places = [
      place('Bali Safari Park', []),
      place('Air Terjun Tegenungan', []),
      place('Taman Ayun', []),
      place('Hidden Canyon', [], ['waterfall']),
      place('Thác Datanla', []),
    ];
    expect(namedFirst(places, (entry) => named!(entry.item)).map((p) => p.item.name)).toEqual([
      'Air Terjun Tegenungan',
      'Hidden Canyon',
      'Thác Datanla',
      'Bali Safari Park',
      'Taman Ayun',
    ]);
  });

  it('is nothing when the words name no kind of place', () => {
    expect(kindNounMatcher('somewhere quiet for dinner near the stay')).toBeNull();
    expect(kindNounMatcher(undefined)).toBeNull();
  });
});
