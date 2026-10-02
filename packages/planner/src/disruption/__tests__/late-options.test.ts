import { nextJourneyStreaks, waitingCrewLine } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  lateChoiceRows,
  lateOptions,
  type LateBooking,
  type LateChoiceContext,
  type LateInput,
} from '../index';

const WES = '0190f0a0-0000-7000-8000-00000000000a';
const JORDAN = '0190f0a0-0000-7000-8000-00000000000b';
const RIN = '0190f0a0-0000-7000-8000-00000000000c';
const SPA = '0190f0a0-0000-7000-8000-0000000000f1';
const KARSA = '0190f0a0-0000-7000-8000-0000000000f2';

const unbooked: LateBooking = {
  supplier: 'none',
  partner: null,
  priceMinor: null,
  currency: null,
  refundMinor: null,
  cancellable: null,
};

// Karsa Spa at 14:00 in Bali (06:00 UTC); it is 13:40 and the ride lands at 14:25.
const input = (over: Partial<LateInput> = {}): LateInput => ({
  title: 'Karsa Spa',
  tz: 'Asia/Makassar',
  now: new Date('2026-10-15T05:40:00Z'),
  startsAt: new Date('2026-10-15T06:00:00Z'),
  endsAt: new Date('2026-10-15T07:30:00Z'),
  etaAt: new Date('2026-10-15T06:25:00Z'),
  lateMin: 25,
  mode: 'drive',
  walkMin: null,
  latePartyIds: [WES, JORDAN],
  waitingIds: [RIN],
  nextStartsAt: null,
  vendorName: null,
  booking: unbooked,
  anchored: false,
  flight: false,
  rideable: true,
  ...over,
});
const ctx = (over: Partial<LateChoiceContext> = {}): LateChoiceContext => ({
  now: new Date('2026-10-15T05:40:00Z'),
  inTrip: true,
  chooserId: WES,
  itemStableId: SPA,
  providerId: null,
  locked: false,
  names: ['Wes', 'Jordan'],
  ...over,
});
const pick = (options: ReturnType<typeof lateOptions>, id: string) => {
  const option = options.find((o) => o.id === id);
  if (option === undefined) throw new Error(`no ${id} option`);
  return option;
};

describe('lateOptions', () => {
  it('splits the group when others are waiting: they start on time, the late ones slot in', () => {
    const options = lateOptions(input());
    expect(options.map((o) => [o.id, o.offered, o.recommended])).toEqual([
      ['push', true, true],
      ['walk', false, false],
      ['skip', true, false],
      ['car', false, false],
    ]);
    expect(pick(options, 'push')).toMatchObject({
      split: true,
      new_start: '2026-10-15T06:25:00.000Z',
      detail: 'The others start at 14:00. You slot in at 14:25.',
      facts: { from: '14:00', to: '14:25', minutes: 25 },
    });
  });

  it('rounds the push up to five minutes and drops it when the next item is in the way', () => {
    const alone = input({ waitingIds: [], lateMin: 12, etaAt: new Date('2026-10-15T06:12:00Z') });
    expect(pick(lateOptions(alone), 'push')).toMatchObject({
      offered: true,
      split: false,
      new_start: '2026-10-15T06:15:00.000Z',
      detail: 'Karsa Spa moves to 14:15.',
    });
    const squeezed = lateOptions({ ...alone, nextStartsAt: new Date('2026-10-15T07:40:00Z') });
    expect(pick(squeezed, 'push').offered).toBe(false);
    expect(squeezed.find((o) => o.recommended)?.id).toBe('skip');
  });

  it('offers the walk only when the measured walk beats the ride, and recommends it', () => {
    const slow = lateOptions(input({ walkMin: 44 }));
    expect(pick(slow, 'walk').offered).toBe(false);
    const quick = lateOptions(input({ walkMin: 12 }));
    expect(pick(quick, 'walk')).toMatchObject({
      offered: true,
      recommended: true,
      arrive_at: '2026-10-15T05:52:00.000Z',
      detail: '12 min on foot from here. There about 13:52.',
      facts: { walk_min: 12, saves_min: 33 },
    });
    // Already on foot: there is no last bit to walk.
    expect(pick(lateOptions(input({ mode: 'walk', walkMin: 12 })), 'walk').offered).toBe(false);
  });

  it('offers a car only to a party with no ride going to a known place', () => {
    expect(pick(lateOptions(input({ mode: 'scooter' })), 'car').offered).toBe(true);
    expect(pick(lateOptions(input({ mode: 'walk' })), 'car').offered).toBe(true);
    expect(pick(lateOptions(input({ mode: 'transfer' })), 'car').offered).toBe(false);
    expect(pick(lateOptions(input({ mode: 'walk', rideable: false })), 'car').offered).toBe(false);
  });

  it("prices SKIP from the booking's own numbers and never guesses a refund", () => {
    const viator: LateBooking = {
      supplier: 'viator',
      partner: null,
      priceMinor: 90_000,
      currency: 'USD',
      refundMinor: 45_000,
      cancellable: true,
    };
    expect(pick(lateOptions(input({ booking: viator })), 'skip')).toMatchObject({
      supplier: 'viator_cancel',
      per_person_minor: -15_000,
      currency: 'USD',
      detail: 'Part of it comes back.',
    });
    const unquoted = { ...viator, refundMinor: null, cancellable: null };
    expect(pick(lateOptions(input({ booking: unquoted })), 'skip')).toMatchObject({
      per_person_minor: null,
      detail: 'Refund depends on the booking policy.',
    });
    const final = { ...viator, cancellable: false };
    expect(pick(lateOptions(input({ booking: final })), 'skip').per_person_minor).toBe(0);
    const klook = { ...viator, supplier: 'affiliate' as const, partner: 'Klook' };
    expect(pick(lateOptions(input({ booking: klook })), 'skip')).toMatchObject({
      supplier: 'partner_link',
      detail: 'Cancel it on Klook.',
    });
  });
});

describe('lateChoiceRows', () => {
  it('changes nothing in the plan for a walk, a car or a split push', () => {
    const options = lateOptions(input({ mode: 'scooter', walkMin: 10 }));
    expect(lateChoiceRows(input(), pick(options, 'walk'), ctx())).toEqual([]);
    expect(lateChoiceRows(input(), pick(options, 'car'), ctx())).toEqual([]);
    expect(lateChoiceRows(input(), pick(options, 'push'), ctx())).toEqual([]);
  });

  it("retimes the party's own item on its own, with UNDO", () => {
    const alone = input({ waitingIds: [] });
    const rows = lateChoiceRows(alone, pick(lateOptions(alone), 'push'), ctx());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `retime_item:${SPA}`,
      state: 'planned',
      autonomous: true,
      reversible: true,
      starts_at: '2026-10-15T06:25:00.000Z',
      affected_user_ids: [WES, JORDAN],
      label: 'Karsa Spa 14:00 → 14:25',
    });
  });

  it('takes the late member’s pick as the yes for a locked item in-trip, and asks the crew before the trip', () => {
    const alone = input({ waitingIds: [] });
    const option = pick(lateOptions(alone), 'push');
    const inTrip = lateChoiceRows(alone, option, ctx({ locked: true }));
    expect(inTrip[0]).toMatchObject({ state: 'approved', decided_by: WES, autonomous: false });
    const before = lateChoiceRows(alone, option, ctx({ locked: true, inTrip: false }));
    expect(before[0]).toMatchObject({
      state: 'needs_yes',
      decided_by: null,
      decider: { policy: 'majority_of_affected', threshold: 2 },
    });
  });

  it('only ever drafts the message to whoever runs the item, and the retime waits on their answer', () => {
    const alone = input({ waitingIds: [], vendorName: 'Karsa' });
    const rows = lateChoiceRows(
      alone,
      pick(lateOptions(alone), 'push'),
      ctx({ providerId: KARSA }),
    );
    expect(rows.map((r) => [r.kind, r.state, r.autonomous])).toEqual([
      ['contact_vendor', 'draft_ready', false],
      ['retime_item', 'waiting_vendor', false],
    ]);
    expect(rows[0]).toMatchObject({
      label: 'Ask Karsa to start at 14:25?',
      decider: { policy: 'any_affected', threshold: 1 },
      facts: { vendor: 'Karsa', why: 'late_push', from: '14:00', to: '14:25', minutes: 25 },
    });
    expect(rows[1]?.depends_on).toBe(rows[0]?.id);
    // A split push still tells them who joins late, and still only as a draft.
    const split = input({ vendorName: 'Karsa' });
    const told = lateChoiceRows(
      split,
      pick(lateOptions(split), 'push'),
      ctx({ providerId: KARSA }),
    );
    expect(told.map((r) => [r.kind, r.state])).toEqual([['contact_vendor', 'draft_ready']]);
    expect(told[0]?.label).toBe('Tell Karsa: Wes and Jordan at 14:25?');
  });

  it('takes an unbooked item off the plan on SKIP, and leaves a booked one to its booker', () => {
    const alone = input({ waitingIds: [] });
    const rows = lateChoiceRows(alone, pick(lateOptions(alone), 'skip'), ctx());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `skip_item:${SPA}`,
      class: 'plan',
      state: 'approved',
      autonomous: false,
      reversible: false,
      decided_by: WES,
    });
    // A wallet booking's time and place on the plan follow the booking: nothing moves it here.
    const booked = input({
      waitingIds: [],
      anchored: true,
      booking: { ...unbooked, supplier: 'viator', priceMinor: 90_000, currency: 'USD' },
    });
    const options = lateOptions(booked);
    expect(pick(options, 'push').offered).toBe(false);
    expect(lateChoiceRows(booked, pick(options, 'skip'), ctx())).toEqual([]);
  });

  it('never pushes or skips a flight', () => {
    const flight = lateOptions(input({ flight: true, anchored: true, mode: 'scooter' }));
    expect(flight.map((o) => [o.id, o.offered])).toEqual([
      ['push', false],
      ['walk', false],
      ['skip', false],
      ['car', true],
    ]);
  });
});

describe('journey hysteresis', () => {
  it('needs two late checks in a row, and a check in between starts over', () => {
    let streaks = { lateStreak: 0, onTimeStreak: 0 };
    streaks = nextJourneyStreaks(streaks, 12);
    expect(streaks).toEqual({ lateStreak: 1, onTimeStreak: 0 });
    streaks = nextJourneyStreaks(streaks, 8);
    expect(streaks).toEqual({ lateStreak: 0, onTimeStreak: 0 });
    streaks = nextJourneyStreaks(nextJourneyStreaks(streaks, 10), 25);
    expect(streaks).toEqual({ lateStreak: 2, onTimeStreak: 0 });
    streaks = nextJourneyStreaks(nextJourneyStreaks(streaks, 3), -4);
    expect(streaks).toEqual({ lateStreak: 0, onTimeStreak: 2 });
  });
});

describe('waitingCrewLine', () => {
  const facts = { names: ['Wes', 'Jordan'], minutes: 25, title: 'Karsa Spa', arrive: '14:20' };
  it('tells the waiting crew what the late ones chose, and says when it changed', () => {
    expect(waitingCrewLine('push', facts, false)).toBe(
      'Wes and Jordan are 25 min late for Karsa Spa. Start without them.',
    );
    expect(waitingCrewLine('walk', facts, true)).toBe(
      'Update: Wes and Jordan are walking the last bit to Karsa Spa, there about 14:20.',
    );
    expect(waitingCrewLine('skip', { ...facts, names: ['Wes'] }, false)).toBe(
      'Wes is skipping Karsa Spa. Go ahead.',
    );
  });
});
