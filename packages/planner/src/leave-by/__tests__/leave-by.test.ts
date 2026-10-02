import { toLocalWallTime } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  AIRPORT_WORDS,
  arriveEarlyMinutes,
  computeLeaveBy,
  isLeaveByEligible,
  joinNames,
  knockReason,
  leaveByCategory,
  leaveByTimers,
  nextLeaveByState,
  ringRemaining,
  stateByClock,
  summarizeReadiness,
} from '../index';

const MINUTE = 60_000;
const BALI = 'Asia/Makassar';

describe('computeLeaveBy on real days', () => {
  it('Batur sunrise: pickup at the villa gate 03:30, a 10-minute walk, leave by 03:10', () => {
    const result = computeLeaveBy({
      startsAt: new Date('2026-10-14T20:30:00Z'), // 04:30 at the trailhead
      pickupAt: new Date('2026-10-14T19:30:00Z'), // 03:30 pickup
      travelMinutes: 10,
      tz: BALI,
    });
    expect(result.localTime).toBe('03:10');
    expect(result.localDate).toBe('2026-10-15');
    expect(result.targetAt.toISOString()).toBe('2026-10-14T19:30:00.000Z');
  });

  it('airport run: at the airport two hours before a 09:40 flight, 55 minutes out', () => {
    const result = computeLeaveBy({
      startsAt: new Date('2026-10-19T01:40:00Z'), // 09:40 departure
      pickupAt: null,
      travelMinutes: 55,
      arriveEarlyMin: arriveEarlyMinutes('flight'),
      tz: BALI,
    });
    expect(result.localTime).toBe('06:35');
  });

  it('reads the destination clock, not the device one', () => {
    const tokyo = computeLeaveBy({
      startsAt: new Date('2026-04-02T21:00:00Z'), // 06:00 in Tokyo
      pickupAt: null,
      travelMinutes: 23,
      tz: 'Asia/Tokyo',
    });
    expect(tokyo.localTime).toBe('05:25');
    expect(tokyo.localDate).toBe('2026-04-03');
  });

  it('counts real minutes across a daylight-saving change', () => {
    // Lisbon falls back at 02:00 WEST (01:00 UTC) on 25 October 2026.
    const result = computeLeaveBy({
      startsAt: new Date('2026-10-25T03:00:00Z'), // 03:00 WET
      pickupAt: null,
      travelMinutes: 120,
      tz: 'Europe/Lisbon',
    });
    expect(result.leaveAt.toISOString()).toBe('2026-10-25T00:50:00.000Z');
    expect(result.localTime).toBe('01:50');
  });

  it('honours an organiser buffer', () => {
    const result = computeLeaveBy({
      startsAt: new Date('2026-10-14T20:30:00Z'),
      pickupAt: new Date('2026-10-14T19:30:00Z'),
      travelMinutes: 10,
      bufferMin: 20,
      tz: BALI,
    });
    expect(result.localTime).toBe('03:00');
  });
});

describe('isLeaveByEligible', () => {
  const at = (iso: string, category: string | null = 'activity') => ({
    startsAt: new Date(iso),
    tz: BALI,
    category,
  });

  it('covers early starts, transfers, flags and long trips, and nothing else', () => {
    expect(isLeaveByEligible(at('2026-10-14T20:30:00Z'), 10)).toBe(true); // 04:30
    expect(isLeaveByEligible(at('2026-10-15T02:00:00Z'), 10)).toBe(false); // 10:00
    expect(isLeaveByEligible(at('2026-10-15T02:00:00Z', 'transfer'), 10)).toBe(true);
    expect(isLeaveByEligible(at('2026-10-15T02:00:00Z'), 50)).toBe(true);
    expect(isLeaveByEligible({ ...at('2026-10-15T02:00:00Z'), flaggedEarly: true }, 5)).toBe(true);
  });

  it('treats an item at an airport picked from place search as an airport run', () => {
    const midday = at('2026-10-15T02:00:00Z', 'transit');
    const place = (name: string, nameLocal: string | null = null) => ({
      category: 'transit',
      name,
      nameLocal,
    });
    expect(
      isLeaveByEligible({ ...midday, place: place('Da Nang International Airport') }, 20),
    ).toBe(true);
    expect(
      isLeaveByEligible({ ...midday, place: place('DAD Terminal 2', 'Sân bay Đà Nẵng') }, 20),
    ).toBe(true);
    expect(isLeaveByEligible({ ...midday, place: place('Bến xe Trung tâm') }, 20)).toBe(false);
    // Only a transit place counts: a café called "Airport Coffee" is still a café.
    expect(
      isLeaveByEligible(
        {
          ...at('2026-10-15T02:00:00Z', 'food'),
          place: { ...place('Airport Coffee'), category: 'food' },
        },
        20,
      ),
    ).toBe(false);
  });

  it.each([
    ['en', 'Da Nang International Airport'],
    ['es', 'Aeropuerto de Málaga'],
    ['pt', 'Aeroporto de Lisboa'],
    ['it', 'Aeroporto di Roma-Fiumicino'],
    ['fr', 'Aéroport de Nice Côte d’Azur'],
    ['de', 'Flughafen München'],
    ['nl', 'Luchthaven Schiphol'],
    ['id', 'Bandar Udara Internasional I Gusti Ngurah Rai'],
    ['ms', 'Lapangan Terbang Antarabangsa Kuala Lumpur'],
    ['tl', 'Paliparan ng Ninoy Aquino'],
    ['vi', 'Sân bay Quốc tế Đà Nẵng'],
    ['vi', 'Cảng hàng không Quốc tế Cam Ranh'],
    ['id', 'Bandara Komodo'],
    ['th', 'สนามบินดอนเมือง'],
    ['ja', '那覇空港'],
    ['zh-Hans', '上海浦东国际机场'],
    ['zh-Hant', '臺灣桃園國際機場'],
    ['ko', '인천국제공항'],
    ['th', 'ท่าอากาศยานสุวรรณภูมิ'],
  ])('names an airport in %s: %s', (lang, name) => {
    expect(AIRPORT_WORDS[lang]).toBeDefined();
    const item = { ...at('2026-10-15T02:00:00Z', 'transit') };
    const place = { category: 'transit', name: 'DAD', nameLocal: name };
    expect(leaveByCategory({ ...item, place })).toBe('airport');
  });

  it('matches airport words as whole words only', () => {
    const item = { ...at('2026-10-15T02:00:00Z', 'transit') };
    const place = (name: string) => ({ category: 'transit', name, nameLocal: null });
    expect(leaveByCategory({ ...item, place: place('Airportstraße Bus Stop') })).toBe('transit');
    expect(leaveByCategory({ ...item, place: place('Hasan Bay Ferry') })).toBe('transit');
    expect(leaveByCategory({ ...item, place: place('AIRPORT shuttle stop') })).toBe('airport');
  });

  it('keeps the item category when it already says what the item is', () => {
    const flight = { ...at('2026-10-15T02:00:00Z', 'flight') };
    const place = { category: 'transit', name: 'Ngurah Rai Airport', nameLocal: null };
    expect(leaveByCategory({ ...flight, place })).toBe('flight');
    expect(leaveByCategory({ ...at('2026-10-15T02:00:00Z', 'transit'), place })).toBe('airport');
    expect(leaveByCategory({ ...at('2026-10-15T02:00:00Z', null), place })).toBe('airport');
    expect(leaveByCategory(at('2026-10-15T02:00:00Z', 'transit'))).toBe('transit');
  });
});

describe('the clock', () => {
  const leaveAt = new Date('2026-10-14T19:10:00Z');

  it('drains the ring over the last 30 minutes', () => {
    expect(ringRemaining(new Date(leaveAt.getTime() - 60 * MINUTE), leaveAt)).toBe(1);
    expect(ringRemaining(new Date(leaveAt.getTime() - 15 * MINUTE), leaveAt)).toBe(0.5);
    expect(ringRemaining(leaveAt, leaveAt)).toBe(0);
  });

  it('arms every timer ahead of now, in order', () => {
    const timers = leaveByTimers(leaveAt, new Date(leaveAt.getTime() - 4 * 60 * MINUTE), 10);
    expect(timers.map((timer) => timer.slot)).toEqual([
      'traffic_3h',
      'traffic_45m',
      'window',
      'alarm',
      't0',
    ]);
    expect(toLocalWallTime(timers[3]!.at, BALI).time).toBe('03:00:00');
    const late = leaveByTimers(leaveAt, new Date(leaveAt.getTime() - 20 * MINUTE), 10);
    expect(late.map((timer) => timer.slot)).toEqual(['alarm', 't0']);
  });
});

describe('escalation', () => {
  it('walks scheduled → window → alerting → departed and stays put when terminal', () => {
    let state = nextLeaveByState('scheduled', 'window_opened');
    expect(state).toBe('window');
    state = nextLeaveByState(state, 'alarm_fired');
    expect(state).toBe('alerting');
    state = nextLeaveByState(state, 'departed');
    expect(state).toBe('departed');
    expect(nextLeaveByState(state, 'rescheduled')).toBe('departed');
    expect(nextLeaveByState('window', 'rescheduled')).toBe('scheduled');
  });

  it('derives the state from the clock', () => {
    const leaveAt = new Date('2026-10-14T19:10:00Z');
    expect(stateByClock(new Date('2026-10-14T18:00:00Z'), leaveAt, 10)).toBe('scheduled');
    expect(stateByClock(new Date('2026-10-14T18:45:00Z'), leaveAt, 10)).toBe('window');
    expect(stateByClock(new Date('2026-10-14T19:00:00Z'), leaveAt, 10)).toBe('alerting');
  });

  it('knocks for a second snooze or a sleeper at T0, once, never for someone up', () => {
    const base = {
      state: 'not_up' as const,
      snoozeCount: 0,
      snoozeLimit: 1,
      knockSentAt: null,
      now: new Date('2026-10-14T19:00:00Z'),
      leaveAt: new Date('2026-10-14T19:10:00Z'),
    };
    expect(knockReason(base)).toBeNull();
    expect(knockReason({ ...base, snoozeCount: 1 })).toBeNull();
    expect(knockReason({ ...base, snoozeCount: 2 })).toBe('snooze');
    expect(knockReason({ ...base, now: base.leaveAt })).toBe('late');
    expect(knockReason({ ...base, snoozeCount: 2, knockSentAt: base.now })).toBeNull();
    expect(knockReason({ ...base, snoozeCount: 2, state: 'up' })).toBeNull();
  });
});

describe('readiness', () => {
  it('counts who is up and names the rest', () => {
    const summary = summarizeReadiness([
      { userId: 'a', state: 'up' },
      { userId: 'b', state: 'not_up' },
      { userId: 'c', state: 'left' },
    ]);
    expect(summary).toEqual({ up: ['a', 'c'], notUp: ['b'], total: 3, allUp: false });
    expect(joinNames(['Alex', 'Dev'])).toBe('Alex and Dev');
    expect(joinNames(['Alex', 'Dev', 'Rin'])).toBe('Alex, Dev and Rin');
  });
});

const ZONES = [
  'Asia/Makassar',
  'Asia/Tokyo',
  'Europe/Lisbon',
  'America/New_York',
  'Australia/Adelaide',
  'Asia/Kathmandu',
];

describe('leave-by properties', { timeout: 60_000 }, () => {
  const instant = fc
    .integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 11, 31) })
    .map((ms) => new Date(Math.floor(ms / MINUTE) * MINUTE));

  it('leaves no later than start (or pickup) − travel − buffer, on a five-minute mark', () => {
    fc.assert(
      fc.property(
        instant,
        fc.option(fc.integer({ min: 0, max: 180 }), { nil: null }),
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 120 }),
        fc.constantFrom(...ZONES),
        (startsAt, pickupBefore, travel, buffer, tz) => {
          const pickupAt =
            pickupBefore === null ? null : new Date(startsAt.getTime() - pickupBefore * MINUTE);
          const result = computeLeaveBy({
            startsAt,
            pickupAt,
            travelMinutes: travel,
            bufferMin: buffer,
            tz,
          });
          const latest = (pickupAt ?? startsAt).getTime() - (travel + buffer) * MINUTE;
          expect(result.leaveAt.getTime()).toBeLessThanOrEqual(latest);
          expect(result.leaveAt.getTime()).toBeGreaterThan(latest - 5 * MINUTE);
          expect(result.leaveAt.getTime()).toBeLessThanOrEqual(startsAt.getTime());
          expect(Number(result.localTime.slice(3)) % 5).toBe(0);
        },
      ),
    );
  });

  it('never leaves later when the trip gets longer', () => {
    fc.assert(
      fc.property(
        instant,
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (startsAt, a, b) => {
          const at = (travel: number) =>
            computeLeaveBy({ startsAt, pickupAt: null, travelMinutes: travel, tz: BALI }).leaveAt;
          const [short, long] = a <= b ? [a, b] : [b, a];
          expect(at(long).getTime()).toBeLessThanOrEqual(at(short).getTime());
        },
      ),
    );
  });

  it('arms only future timers, sorted, none after leave_at', () => {
    fc.assert(
      fc.property(
        instant,
        fc.integer({ min: -600, max: 600 }),
        fc.integer({ min: 0, max: 60 }),
        (leaveAt, nowOffset, lead) => {
          const now = new Date(leaveAt.getTime() + nowOffset * MINUTE);
          const timers = leaveByTimers(leaveAt, now, lead);
          for (const [index, timer] of timers.entries()) {
            expect(timer.at.getTime()).toBeGreaterThan(now.getTime());
            expect(timer.at.getTime()).toBeLessThanOrEqual(leaveAt.getTime());
            if (index > 0) {
              expect(timer.at.getTime()).toBeGreaterThanOrEqual(timers[index - 1]!.at.getTime());
            }
          }
        },
      ),
    );
  });

  it('keeps departed and cancelled leave-bys where they are', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('departed' as const, 'cancelled' as const),
        fc.array(
          fc.constantFrom(
            'window_opened' as const,
            'alarm_fired' as const,
            'departed' as const,
            'cancelled' as const,
            'rescheduled' as const,
          ),
        ),
        (terminal, events) => {
          expect(events.reduce(nextLeaveByState, terminal)).toBe(terminal);
        },
      ),
    );
  });
});
