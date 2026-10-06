import { tokens } from '@cp/design-tokens';
import { describe, expect, it } from '@jest/globals';

import { ALEX, JORDAN, MAYA, ME, STATS } from '../../dev/recap-fixtures';
import { memoryMoment, reactionChips, type MemoryReactionRow } from '../memory-model';

const row = (
  user_id: string,
  emoji: string | null,
  text: string | null,
  name = 'Someone',
): MemoryReactionRow => ({ user_id, emoji, text, name, colour: tokens.color.yellow });

describe('memory reactions', () => {
  it('gathers bare emoji into one chip per emoji, led by the first to react, and keeps lines apart', () => {
    const chips = reactionChips(
      [
        row(MAYA, '❤', null, 'Maya'),
        row(JORDAN, '❤', 'again??', 'Jordan'),
        row(ALEX, '❤', null, 'Alex'),
        row(ME, '+1', null, 'Winston'),
      ],
      [],
      ME,
    );
    expect(chips.map((c) => [c.name, c.emoji, c.count, c.text, c.mine])).toEqual([
      ['Maya', '❤', 2, null, false],
      ['Jordan', '❤', 1, 'again??', false],
      ['Winston', '+1', 1, null, true],
    ]);
  });

  it('lets a live reaction replace that traveller’s synced one, never counting them twice', () => {
    const chips = reactionChips(
      [row(MAYA, '❤', null, 'Maya'), row(ALEX, '❤', null, 'Alex')],
      [{ userId: ALEX, emoji: '🔥', text: null }],
      ME,
    );
    expect(chips.map((c) => [c.emoji, c.count])).toEqual([
      ['❤', 1],
      ['🔥', 1],
    ]);
  });

  it('shows a reaction from someone with no synced row yet, and drops empty ones', () => {
    const chips = reactionChips(
      [row(MAYA, null, '  ', 'Maya')],
      [{ userId: JORDAN, emoji: null, text: 'same time next year' }],
      ME,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ userId: JORDAN, name: '', text: 'same time next year' });
  });
});

describe('the moment a memory calls back', () => {
  it('prefers the before-sunrise start on the best day', () => {
    expect(memoryMoment(STATS, 'stored')).toEqual({
      kind: 'sunrise',
      time: '05:10',
      name: 'Sơn Trà',
    });
  });

  it('falls back to the best day, then the trip, then the stored line without a recap', () => {
    const plain = { ...STATS, superlatives: [] };
    expect(memoryMoment(plain, 'stored')).toEqual({ kind: 'best_day', dayNo: 2, days: STATS.days });
    expect(memoryMoment({ ...plain, best_day: null }, 'stored')).toEqual({
      kind: 'trip',
      days: STATS.days,
      travellers: STATS.travellers,
    });
    expect(memoryMoment(null, 'stored')).toEqual({ kind: 'written', text: 'stored' });
  });
});
