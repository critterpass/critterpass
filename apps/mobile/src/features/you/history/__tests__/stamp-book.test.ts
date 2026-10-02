/** The stamps list's year filter and the merge of this phone's unsynced past trips. */
import { describe, expect, it } from '@jest/globals';

import { mergePastTrips } from '../pending-past-trips';
import { stampsForYear, stampYears, type ProfileStamp } from '../stamp-book';

const stamp = (id: string, kind: ProfileStamp['kind'], date: string | null): ProfileStamp => ({
  id,
  kind,
  title: id,
  date,
  daysUntil: null,
  ink: null,
  tripId: null,
});

const BOOK = [
  stamp('lisbon', 'trip', '2024-06-03'),
  stamp('japan', 'self', '2022-04-01'),
  stamp('home', 'home', null),
  stamp('seoul', 'trip', '2024-01-10'),
];

describe('stamps list', () => {
  it('offers each year once, newest first', () => {
    expect(stampYears(BOOK)).toEqual([2024, 2022]);
  });

  it('lists oldest first with undated stamps last, or one year only', () => {
    expect(stampsForYear(BOOK, null).map((s) => s.id)).toEqual([
      'japan',
      'seoul',
      'lisbon',
      'home',
    ]);
    expect(stampsForYear(BOOK, 2024).map((s) => s.id)).toEqual(['seoul', 'lisbon']);
  });
});

describe('mergePastTrips', () => {
  const row = (id: string) => ({ id, country: 'PT', month: '2019-06-01', place_id: null });

  it('shows an unsynced add once, and hides a removal before it syncs', () => {
    const merged = mergePastTrips([row('a'), row('b')], {
      added: [row('b'), row('c')],
      removed: new Set(['a']),
    });
    expect(merged.map((r) => r.id)).toEqual(['b', 'c']);
  });
});
