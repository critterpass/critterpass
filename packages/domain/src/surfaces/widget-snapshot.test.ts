import { describe, expect, it } from 'vitest';

import {
  buildWidgetSnapshot,
  etaBucket,
  widgetRefreshPriority,
  widgetSnapshotContent,
  type WidgetSnapshotInput,
} from './widget-snapshot';

const FLIGHT = {
  id: '0192a000-0000-7000-8000-000000000001',
  carrier: 'VJ',
  flight_no: 'VJ631',
  dep_airport: 'SGN',
  arr_airport: 'DAD',
  departs_at: '2026-10-03T01:00:00.000Z',
  boarding_at: null,
  gate: null,
  terminal: null,
  status: 'scheduled',
  delay_min: null,
};

const CREW = {
  meetup: null,
  members: [{ user_id: '0192a000-0000-7000-8000-000000000002', bucket: 'close' as const }],
};

function input(overrides: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput {
  return {
    now: new Date('2026-10-02T00:00:00Z'),
    trip: null,
    countdownTargetAt: new Date('2026-10-03T01:00:00Z'),
    vote: null,
    today: null,
    balances: { currency: 'VND', net_minor: -125_000 },
    crew: CREW,
    critterdex: { found: 3, total: 61 },
    nextFlight: FLIGHT,
    nextLeaveBy: null,
    passPlus: false,
    boostActive: false,
    ...overrides,
  };
}

describe('widget snapshot', () => {
  it('omits the next flight and the crew and marks them locked without the perks', () => {
    const snapshot = buildWidgetSnapshot(input());
    expect(snapshot.next_flight).toBeNull();
    expect(snapshot.crew).toBeNull();
    expect(snapshot.locked).toEqual(['crew', 'next_flight']);
    expect(snapshot.countdown).toEqual({ target_at: '2026-10-03T01:00:00.000Z' });
  });

  it('carries the next flight with Pass+ and the crew with a boost', () => {
    const snapshot = buildWidgetSnapshot(input({ passPlus: true, boostActive: true }));
    expect(snapshot.next_flight).toEqual(FLIGHT);
    expect(snapshot.crew).toEqual(CREW);
    expect(snapshot.locked).toEqual([]);
  });

  it('keeps the same content across clocks, so the ETag only moves with the data', () => {
    const a = buildWidgetSnapshot(input());
    const b = buildWidgetSnapshot(input({ now: new Date('2026-10-02T05:00:00Z') }));
    expect(widgetSnapshotContent(a)).toEqual(widgetSnapshotContent(b));
  });
});

describe('crew ETA buckets', () => {
  it('buckets arrivals, short and long ETAs and unknowns', () => {
    expect(etaBucket(null, 1)).toBe('here');
    expect(etaBucket(1, null)).toBe('here');
    expect(etaBucket(12, 0.4)).toBe('close');
    expect(etaBucket(40, 0.1)).toBe('on_way');
    expect(etaBucket(null, null)).toBe('unknown');
  });
});

describe('widget refresh priority', () => {
  it('pushes vote closes and tally moves at once, batches the rest and ignores chat', () => {
    expect(widgetRefreshPriority('poll.closed')).toBe('priority');
    expect(widgetRefreshPriority('ballot.cast')).toBe('priority');
    expect(widgetRefreshPriority('expense.added')).toBe('routine');
    expect(widgetRefreshPriority('booking.flight_changed')).toBe('routine');
    expect(widgetRefreshPriority('chat.message_sent')).toBeNull();
  });
});
