import { openSpans, type FitGrade, type Hours } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  fitPlace,
  type FitContext,
  type FitItem,
  type FitPlace,
  type FitTravel,
} from '../../src/fit/index';
import { at, TZ, VILLA } from './bali-fixture';

const PEOPLE = [
  '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000a002',
  '00000000-0000-4000-8000-00000000a003',
  '00000000-0000-4000-8000-00000000a004',
];
const stable = (n: number) => `00000000-0000-4000-8000-00000000b${String(n).padStart(3, '0')}`;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const GRADE_RANK: Readonly<Record<FitGrade, number>> = { good: 0, possible: 1, no: 2 };

const itemArb = (index: number) =>
  fc
    .record({
      startQ: fc.integer({ min: 28, max: 84 }),
      lengthQ: fc.integer({ min: 2, max: 16 }),
      who: fc.subarray(PEOPLE),
      locked: fc.boolean(),
      dLat: fc.integer({ min: -60, max: 60 }),
      dLng: fc.integer({ min: -60, max: 60 }),
    })
    .map((raw): FitItem => ({
      stableId: stable(index),
      poiId: null,
      category: 'other',
      startsAt: at(17, clock(raw.startQ * 15)),
      endsAt: at(17, clock(Math.min(raw.startQ + raw.lengthQ, 95) * 15)),
      attendeeIds: raw.who,
      locked: raw.locked,
      outdoor: false,
      point: { lat: VILLA.lat + raw.dLat / 1000, lng: VILLA.lng + raw.dLng / 1000 },
    }));

const scenarioArb = fc.record({
  items: fc
    .integer({ min: 0, max: 6 })
    .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => itemArb(i)))),
  openQ: fc.integer({ min: 24, max: 60 }),
  closeQ: fc.integer({ min: 64, max: 92 }),
  visitQ: fc.integer({ min: 2, max: 12 }),
  baseMinutes: fc.integer({ min: 0, max: 60 }),
  scale: fc.integer({ min: 1, max: 4 }),
});

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

const travelFor =
  (base: number, scale: number): FitTravel =>
  (from, to) => {
    if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: true };
    const metres = Math.hypot(from.lat - to.lat, from.lng - to.lng) * 111_000;
    return { minutes: (base + Math.round(metres / 400)) * scale, mode: 'drive', approx: true };
  };

function build(scenario: Scenario, scale = 1) {
  const hours: Hours = {
    weekly: { sa: [{ start: clock(scenario.openQ * 15), end: clock(scenario.closeQ * 15) }] },
  };
  const context: FitContext = {
    tz: TZ,
    participants: PEOPLE,
    driveFactor: 1,
    travel: travelFor(scenario.baseMinutes, scale),
    days: [
      {
        dayId: '00000000-0000-4000-8000-00000000c001',
        dayNo: 1,
        date: '2026-10-17',
        kind: 'full',
        fromMin: 7 * 60,
        toMin: 22 * 60,
        items: scenario.items,
        stay: VILLA,
        rain: null,
        crowdFactor: 1,
      },
    ],
  };
  const place: FitPlace = {
    poiId: '00000000-0000-4000-8000-00000000d001',
    point: { lat: VILLA.lat + 0.01, lng: VILLA.lng + 0.01 },
    category: 'museum',
    hours,
    timeNeededMin: scenario.visitQ * 15,
    outdoor: false,
  };
  return { context, place, hours };
}

const localMinute = (iso: string) => {
  const local = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

describe('fit engine properties', { timeout: 60_000 }, () => {
  it('never overlaps a locked item or another attendee, never outside open spans', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const { context, place, hours } = build(scenario);
        const [day] = fitPlace(context, place).days;
        if (!day?.slot) return;
        const start = localMinute(day.slot.starts_at);
        const end = localMinute(day.slot.ends_at);
        const spans = openSpans(hours, '2026-10-17');
        expect(spans.some((span) => span.start <= start && span.end >= end)).toBe(true);
        const whoReason = day.reasons.find((reason) => reason.code === 'who_free');
        const who = whoReason?.code === 'who_free' ? whoReason.params.user_ids : PEOPLE;
        for (const item of scenario.items) {
          const itemStart = localMinute(item.startsAt.toISOString());
          const itemEnd = localMinute(item.endsAt.toISOString());
          if (!(itemStart < end && itemEnd > start)) continue;
          if (item.stableId === day.needs_move) {
            expect(item.locked).toBe(false);
            continue;
          }
          const people = item.attendeeIds.length > 0 ? item.attendeeIds : PEOPLE;
          expect(people.filter((uid) => who.includes(uid))).toEqual([]);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('more travel never upgrades a grade', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const near = build(scenario, 1);
        const far = build(scenario, scenario.scale);
        const [nearDay] = fitPlace(near.context, near.place).days;
        const [farDay] = fitPlace(far.context, far.place).days;
        expect(GRADE_RANK[farDay?.grade ?? 'no']).toBeGreaterThanOrEqual(
          GRADE_RANK[nearDay?.grade ?? 'no'],
        );
      }),
      { numRuns: 400 },
    );
  });
});
