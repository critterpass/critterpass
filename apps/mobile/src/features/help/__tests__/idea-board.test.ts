import { describe, expect, it } from '@jest/globals';

import {
  boardRows,
  hasMyVote,
  shownCount,
  votesLeft,
  type BoardIdea,
  type BoardStatus,
} from '../ideas/board';

const idea = (
  id: string,
  status: BoardStatus,
  votes: number,
  created = '2026-10-01T00:00:00Z',
  changed = created,
): BoardIdea => ({
  id,
  title: id,
  description: null,
  status,
  team_note: null,
  votes_count: votes,
  status_changed_at: changed,
  created_at: created,
});

const IDEAS = [
  idea('packing', 'planned', 412, '2026-09-01T00:00:00Z'),
  idea('receipts', 'building', 356, '2026-09-20T00:00:00Z'),
  idea('voice', 'open', 198, '2026-10-02T00:00:00Z'),
  idea('maps', 'shipped', 90, '2026-08-01T00:00:00Z', '2026-10-03T00:00:00Z'),
  idea('icons', 'shipped', 50, '2026-08-01T00:00:00Z', '2026-09-03T00:00:00Z'),
  idea('dupe', 'merged', 10),
  idea('nope', 'declined', 5),
];

describe('board tabs', () => {
  it('TOP lists ideas taking votes, most voted first', () => {
    expect(boardRows(IDEAS, [], 'top').map((i) => i.id)).toEqual(['packing', 'receipts', 'voice']);
  });

  it('NEW lists newest first with the traveller’s own idea under review', () => {
    const mine = [idea('mine', 'pending_review', 0, '2026-10-05T00:00:00Z')];
    expect(boardRows(IDEAS, mine, 'new').map((i) => i.id)).toEqual([
      'mine',
      'voice',
      'receipts',
      'packing',
    ]);
  });

  it('NEW drops an own idea once the board has it (published)', () => {
    const mine = [idea('voice', 'pending_review', 0, '2026-10-02T00:00:00Z')];
    expect(boardRows(IDEAS, mine, 'new').filter((i) => i.id === 'voice')).toHaveLength(1);
  });

  it('SHIPPED lists the latest shipped first; declined and merged never show', () => {
    expect(boardRows(IDEAS, [], 'shipped').map((i) => i.id)).toEqual(['maps', 'icons']);
    for (const tab of ['top', 'new', 'shipped'] as const) {
      const ids = boardRows(IDEAS, [], tab).map((i) => i.id);
      expect(ids).not.toContain('dupe');
      expect(ids).not.toContain('nope');
    }
  });
});

describe('own votes before they sync', () => {
  const synced = new Set(['packing']);

  it('a tap overrides the synced vote, both ways', () => {
    expect(hasMyVote('packing', synced, new Map())).toBe(true);
    expect(hasMyVote('packing', synced, new Map([['packing', false]]))).toBe(false);
    expect(hasMyVote('voice', synced, new Map([['voice', true]]))).toBe(true);
  });

  it('the count moves by the vote added or taken back, never below zero', () => {
    const packing = IDEAS[0]!;
    const voice = IDEAS[2]!;
    expect(shownCount(packing, synced, new Map())).toBe(412);
    expect(shownCount(packing, synced, new Map([['packing', false]]))).toBe(411);
    expect(shownCount(voice, synced, new Map([['voice', true]]))).toBe(199);
    expect(shownCount(idea('x', 'open', 0), new Set(['x']), new Map([['x', false]]))).toBe(0);
  });
});

describe('votes left this month', () => {
  const month = '2026-10';
  const votes = (n: number, monthKey = month) =>
    Array.from({ length: n }, (_, i) => ({ idea_id: `i${i}`, month_key: monthKey }));

  it('counts only this month’s standing votes against the budget of ten', () => {
    expect(votesLeft(votes(3), new Map(), month)).toBe(7);
    expect(votesLeft([...votes(3), ...votes(4, '2026-09')], new Map(), month)).toBe(7);
  });

  it('a new vote spends one; taking one back returns it', () => {
    expect(votesLeft(votes(3), new Map([['new', true]]), month)).toBe(6);
    expect(votesLeft(votes(3), new Map([['i0', false]]), month)).toBe(8);
  });

  it('taking back a vote from last month frees nothing this month', () => {
    const lastMonth = [{ idea_id: 'old', month_key: '2026-09' }];
    expect(votesLeft([...votes(10), ...lastMonth], new Map([['old', false]]), month)).toBe(0);
  });

  it('never goes below zero', () => {
    expect(votesLeft(votes(10), new Map([['extra', true]]), month)).toBe(0);
  });
});
