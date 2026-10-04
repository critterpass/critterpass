import { describe, expect, it } from '@jest/globals';

import { matchOutcome } from '../swipe-outcome';

const uid = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`;

describe('where a swipe match went', () => {
  const base = { changeSetId: null, dayNo: null, ideaId: null };

  it('reads a match with its idea as in Ideas', () => {
    expect(matchOutcome({ ...base, ideaId: uid(1) }, false)).toEqual({ kind: 'idea' });
  });

  it('keeps an earlier match turned into a change set on its suggested day', () => {
    expect(matchOutcome({ ...base, changeSetId: uid(2), dayNo: 3, ideaId: uid(1) }, true)).toEqual({
      kind: 'suggested',
      dayNo: 3,
    });
    expect(matchOutcome({ ...base, changeSetId: uid(2) }, true)).toEqual({ kind: 'match' });
  });

  it('reads a new match as in Ideas before its idea row has synced', () => {
    expect(matchOutcome(base, true)).toEqual({ kind: 'idea' });
    expect(matchOutcome(base, false)).toEqual({ kind: 'match' });
  });
});
