import { describe, expect, it } from 'vitest';

import {
  checkPlan,
  DEFAULT_CHECK_THRESHOLDS,
  tooFarAlternative,
  type CheckInput,
  type TooFarCandidate,
} from '../../src/check/index';
import type { FitItem, FitLeg, FitTravel } from '../../src/fit/index';
import { at, CREW, daily, TZ, VILLA } from '../fit/bali-fixture';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ULUWATU = uid(1001);
const DINNER = uid(1002);
const SUNDAY = uid(1011);
const JIMBARAN = uid(1051);
const SEMINYAK = uid(1052);
const CLOSED_EARLY = uid(1053);
const BEACH = uid(1054);

const FAR = { lat: -8.829, lng: 115.085 };
const NEAR_FAR = { lat: -8.79, lng: 115.16 };

const LEGS: Readonly<Record<string, number>> = {
  [`stay>${ULUWATU}`]: 120,
  [`${ULUWATU}>${DINNER}`]: 120,
  [`${DINNER}>stay`]: 15,
  [`${ULUWATU}>poi:${JIMBARAN}`]: 20,
  [`poi:${JIMBARAN}>stay`]: 90,
  [`${ULUWATU}>poi:${SEMINYAK}`]: 45,
  [`poi:${SEMINYAK}>stay`]: 80,
  [`${ULUWATU}>poi:${CLOSED_EARLY}`]: 10,
  [`poi:${CLOSED_EARLY}>stay`]: 60,
  [`${ULUWATU}>poi:${BEACH}`]: 5,
  [`poi:${BEACH}>stay`]: 50,
};

const travel: FitTravel = (from, to): FitLeg => {
  if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: false };
  const minutes = LEGS[`${from.key}>${to.key}`] ?? LEGS[`${to.key}>${from.key}`] ?? 60;
  return { minutes, mode: 'drive', approx: false };
};

const item = (stableId: string, from: string, to: string, extra: Partial<FitItem>): FitItem => ({
  stableId,
  poiId: null,
  category: 'other',
  startsAt: at(18, from),
  endsAt: at(18, to),
  attendeeIds: [],
  locked: false,
  outdoor: false,
  point: VILLA,
  ...extra,
});

function sunday(dinnerLocked = false): CheckInput {
  return {
    context: {
      tz: TZ,
      participants: CREW,
      driveFactor: 1.3,
      travel,
      days: [
        {
          dayId: SUNDAY,
          dayNo: 6,
          date: '2026-10-18',
          kind: 'full',
          fromMin: 7 * 60,
          toMin: 22 * 60,
          items: [
            item(ULUWATU, '17:00', '19:00', { point: FAR, category: 'temple_shrine' }),
            item(DINNER, '20:30', '22:00', { category: 'food', locked: dinnerLocked }),
          ],
          stay: VILLA,
          rain: null,
          crowdFactor: 1,
        },
      ],
    },
    places: new Map(),
    bookings: [],
    thresholds: DEFAULT_CHECK_THRESHOLDS,
    now: new Date('2026-10-01T09:00:00+08:00'),
  };
}

const CANDIDATES: TooFarCandidate[] = [
  { poiId: SEMINYAK, category: 'food', point: NEAR_FAR, hours: daily('11:00', '23:00') },
  { poiId: JIMBARAN, category: 'food', point: NEAR_FAR, hours: daily('16:00', '23:00') },
  { poiId: CLOSED_EARLY, category: 'food', point: NEAR_FAR, hours: daily('10:00', '20:00') },
  { poiId: BEACH, category: 'beach', point: NEAR_FAR, hours: null },
];

describe('the too-far alternative', () => {
  it('swaps dinner back in Ubud for Jimbaran on the way back', () => {
    const alternative = tooFarAlternative(sunday(), SUNDAY, CANDIDATES);
    expect(alternative).toMatchObject({
      stableId: DINNER,
      poiId: JIMBARAN,
      driveBefore: 255,
      driveAfter: 230,
      legInMin: 20,
    });
    expect(alternative?.op).toMatchObject({
      op: 'swap',
      target: DINNER,
      after: { poi_id: JIMBARAN, custom_place: null },
    });
    expect(alternative?.op.before).toBeUndefined();
  });

  it('never swaps a booked stop, a place of another kind or one closed at that time', () => {
    expect(tooFarAlternative(sunday(true), SUNDAY, CANDIDATES)).toBeNull();
    expect(tooFarAlternative(sunday(), SUNDAY, [CANDIDATES[2]!, CANDIDATES[3]!])).toBeNull();
  });

  it('keeps the long-drive card on its own screen', () => {
    const tooFar = checkPlan(sunday()).find((issue) => issue.kind === 'too_far');
    expect(tooFar?.fix).toEqual({ kind: 'screen', screen: 'too_far' });
  });
});
