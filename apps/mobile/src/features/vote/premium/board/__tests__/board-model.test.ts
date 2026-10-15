import { describe, expect, it } from '@jest/globals';

import { boardAction, boardShape, canRemove, finalPickOf, togglePick } from '../board-model';

const option = (id: string) => ({ id }) as never;
const poll = (
  stage: 'board' | 'final' | null,
  count: number,
  status: 'open' | 'closed' = 'open',
) => ({
  stage,
  status,
  options: Array.from({ length: count }, (_, i) => option(`o-${i}`)),
});

describe('destination board model', () => {
  it('draws an empty board, a board of places, or the final', () => {
    expect(boardShape(poll('board', 0))).toBe('empty');
    expect(boardShape(poll('board', 1))).toBe('board');
    expect(boardShape(poll(null, 3))).toBe('board');
    expect(boardShape(poll('final', 2))).toBe('final');
  });

  it('offers the organiser a lock-in for one place and the final for two or more', () => {
    expect(boardAction(poll('board', 1), true)).toBe('lock_in');
    expect(boardAction(poll('board', 2), true)).toBe('go_to_final');
    expect(boardAction(poll('board', 5), true)).toBe('go_to_final');
  });

  it('offers nothing to a member, on an empty board, in the final or once closed', () => {
    expect(boardAction(poll('board', 1), false)).toBeNull();
    expect(boardAction(poll('board', 3), false)).toBeNull();
    expect(boardAction(poll('board', 0), true)).toBeNull();
    expect(boardAction(poll('final', 2), true)).toBeNull();
    expect(boardAction(poll('board', 2, 'closed'), true)).toBeNull();
  });

  it('reads a tie for a final spot as a pick for the open spots', () => {
    expect(
      finalPickOf({ reason: 'needs_pick', tied_option_ids: ['b', 'c'], settled_option_ids: ['a'] }),
    ).toEqual({ tied: ['b', 'c'], settled: ['a'], spots: 1 });
    expect(
      finalPickOf({
        reason: 'needs_pick',
        tied_option_ids: ['a', 'b', 'c'],
        settled_option_ids: [],
      }),
    ).toEqual({ tied: ['a', 'b', 'c'], settled: [], spots: 2 });
    expect(finalPickOf({ reason: 'board_advances' })).toBeNull();
    expect(finalPickOf(undefined)).toBeNull();
    expect(finalPickOf({ reason: 'needs_pick', tied_option_ids: [] })).toBeNull();
  });

  it('toggles tied places and keeps no more picks than open spots', () => {
    const one = { tied: ['b', 'c'], settled: ['a'], spots: 1 };
    expect(togglePick(one, [], 'b')).toEqual(['b']);
    expect(togglePick(one, ['b'], 'c')).toEqual(['c']);
    expect(togglePick(one, ['b'], 'b')).toEqual([]);
    expect(togglePick(one, [], 'a')).toEqual([]);
    const two = { tied: ['a', 'b', 'c'], settled: [], spots: 2 };
    expect(togglePick(two, ['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePick(two, ['a', 'b'], 'c')).toEqual(['b', 'c']);
  });

  it('lets the organiser or the pitcher take a place off', () => {
    expect(canRemove(true, 'maya', 'me')).toBe(true);
    expect(canRemove(false, 'me', 'me')).toBe(true);
    expect(canRemove(false, 'maya', 'me')).toBe(false);
    expect(canRemove(false, null, 'me')).toBe(false);
  });
});
