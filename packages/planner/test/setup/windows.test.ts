import { describe, expect, it } from 'vitest';

import { windowOptions } from '../../src/setup/no-fit-options';
import {
  addDays,
  bestWindow,
  datesOf,
  scoreWindows,
  type WindowDayState,
  type WindowMember,
} from '../../src/setup/windows';

const CREW = ['winston', 'mei', 'rin', 'ana', 'jo', 'dev'] as const;

/** Blossoms peak around April 3 and fade by a point every day or so after. */
const season = (date: string) => {
  const [, month, day] = date.split('-').map(Number);
  if (month !== 4) return 0;
  return Math.max(0, 100 - 5 * Math.abs((day ?? 0) - 3));
};

function member(
  uid: string,
  range: readonly string[],
  overrides: Readonly<Record<string, WindowDayState>> = {},
  askable: readonly string[] = [],
): WindowMember {
  const days = new Map<string, WindowDayState>(range.map((d) => [d, 'free']));
  for (const [date, state] of Object.entries(overrides)) days.set(date, state);
  return { uid, days, askable: new Set(askable) };
}

const APRIL = datesOf('2027-04-01', 30);
const THROUGH_JUNE = datesOf('2027-04-01', 91);

describe('best window (3c-3)', () => {
  // Free counts of the April heatmap: 6 of 6 only from the 2nd to the 9th.
  const COUNTS = [
    4, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, 3, 3, 2, 3, 4, 5, 5, 3, 2, 2, 3, 4, 4, 3, 2, 1, 2, 3, 4,
  ];
  const members = CREW.map((uid, index) =>
    member(
      uid,
      APRIL,
      Object.fromEntries(
        APRIL.filter((_, day) => (COUNTS[day] ?? 0) <= index).map((d) => [d, 'busy' as const]),
      ),
    ),
  );

  it('finds Apr 2–9 with all six free, the blossom week', () => {
    const options = windowOptions({
      members,
      lengthDays: 8,
      from: '2027-04-01',
      seasonScore: season,
    });
    expect(options).toEqual([
      expect.objectContaining({
        kind: 'best',
        start: '2027-04-02',
        end: '2027-04-09',
        freeCount: 6,
        memberCount: 6,
        missingMemberIds: [],
        reason: 'season_peak',
        isPick: true,
      }),
    ]);
  });

  it('counts a member who has not synced as able to come', () => {
    const synced = members.slice(0, 5);
    const dev = { uid: 'dev', days: new Map<string, WindowDayState>() };
    const best = bestWindow({ members: [...synced, dev], lengthDays: 8, from: '2027-04-01' });
    expect(best).toMatchObject({ start: '2027-04-02', freeCount: 6, memberCount: 6 });
  });
});

describe('no week fits (3c-4)', () => {
  const inari = { id: 'md-inari', ownerId: 'mei', dates: new Set(['2027-04-02', '2027-04-03']) };
  const arashiyama = { id: 'md-arashiyama', ownerId: 'rin', dates: new Set(['2027-04-04']) };
  const members = [
    member('winston', THROUGH_JUNE),
    member(
      'mei',
      THROUGH_JUNE,
      Object.fromEntries(datesOf('2027-04-10', 6).map((d) => [d, 'busy'])),
    ),
    member('rin', THROUGH_JUNE, { '2027-04-01': 'busy' }),
    member('ana', THROUGH_JUNE),
    member('jo', THROUGH_JUNE),
    member(
      'dev',
      THROUGH_JUNE,
      { '2027-04-02': 'maybe', '2027-04-03': 'maybe', '2027-04-04': 'maybe' },
      ['2027-04-02', '2027-04-03', '2027-04-04'],
    ),
  ];
  const fare = (start: string) => (start <= '2027-04-09' ? 150_000n : 141_000n);

  it('offers the partial week, the full-crew week $90 cheaper, and asking Dev first', () => {
    const options = windowOptions({
      members,
      lengthDays: 8,
      from: '2027-04-01',
      seasonScore: season,
      fare,
      mustDos: [inari, arashiyama, { id: 'md-dev', ownerId: 'dev', dates: null }],
    });
    expect(options).toEqual([
      {
        position: 0,
        kind: 'partial',
        start: '2027-04-02',
        end: '2027-04-09',
        freeCount: 5,
        memberCount: 6,
        missingMemberIds: ['dev'],
        missedMustDoIds: ['md-arashiyama', 'md-inari'],
        askUserId: null,
        priceDeltaMinor: null,
        seasonScore: 86,
        reason: 'season_peak',
        isPick: false,
      },
      expect.objectContaining({
        position: 1,
        kind: 'full_crew',
        start: '2027-04-16',
        end: '2027-04-23',
        freeCount: 6,
        priceDeltaMinor: -9_000n,
        reason: 'season_trade',
        isPick: false,
      }),
      expect.objectContaining({
        position: 2,
        kind: 'ask_first',
        start: '2027-04-02',
        askUserId: 'dev',
        reason: 'maybe_block',
        isPick: true,
      }),
    ]);
  });

  it('does not offer an ask when the blocker is busy or not askable', () => {
    const busyDev = members.map((m) =>
      m.uid === 'dev' ? member('dev', THROUGH_JUNE, { '2027-04-03': 'busy' }) : m,
    );
    const kinds = windowOptions({ members: busyDev, lengthDays: 8, from: '2027-04-01' }).map(
      (o) => o.kind,
    );
    expect(kinds).not.toContain('ask_first');
    const silentDev = members.map((m) =>
      m.uid === 'dev' ? member('dev', THROUGH_JUNE, { '2027-04-03': 'maybe' }) : m,
    );
    const options = windowOptions({ members: silentDev, lengthDays: 8, from: '2027-04-01' });
    expect(options.some((o) => o.kind === 'ask_first')).toBe(false);
  });

  it('never asks when two members block the best week', () => {
    const twoBlockers = members.map((m) =>
      m.uid === 'jo' ? member('jo', THROUGH_JUNE, { '2027-04-06': 'maybe' }, ['2027-04-06']) : m,
    );
    const options = windowOptions({
      members: twoBlockers,
      lengthDays: 8,
      from: '2027-04-01',
      seasonScore: season,
    });
    expect(options[0]).toMatchObject({
      kind: 'partial',
      start: '2027-04-02',
      freeCount: 4,
      missingMemberIds: ['jo', 'dev'],
    });
    expect(options.some((o) => o.kind === 'ask_first')).toBe(false);
  });
});

describe('window engine edges', () => {
  it('returns nothing when nobody has reported a day', () => {
    const empty = CREW.map((uid) => ({ uid, days: new Map<string, WindowDayState>() }));
    expect(windowOptions({ members: empty, lengthDays: 7, from: '2027-04-01' })).toEqual([]);
  });

  it('spans months and picks the earliest of equals', () => {
    const range = datesOf('2027-04-20', 30);
    const members = CREW.map((uid) =>
      member(uid, range, uid === 'rin' ? { '2027-04-26': 'busy', '2027-05-15': 'busy' } : {}),
    );
    const best = bestWindow({ members, lengthDays: 10, from: '2027-04-20' });
    expect(best).toMatchObject({ start: '2027-04-27', end: '2027-05-06', freeCount: 6 });
  });

  it('handles a boosted crew of 16 and caps the horizon at six months', () => {
    const range = datesOf('2027-01-01', 240);
    const crew = Array.from({ length: 16 }, (_, i) =>
      member(
        `m${String(i).padStart(2, '0')}`,
        range,
        Object.fromEntries(
          range.filter((_, day) => (day * 7 + i * 3) % 11 === 0).map((d) => [d, 'busy' as const]),
        ),
      ),
    );
    const windows = scoreWindows({ members: crew, lengthDays: 5, from: '2027-01-01' });
    expect(windows.every((w) => w.end <= addDays('2027-01-01', 183))).toBe(true);
    expect(windows.every((w) => w.memberCount === 16)).toBe(true);
    const counts = windows.map((w) => w.freeCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const options = windowOptions({ members: crew, lengthDays: 5, from: '2027-01-01' });
    expect(options.length).toBeGreaterThan(0);
    expect(options.filter((o) => o.isPick)).toHaveLength(1);
  });
});
