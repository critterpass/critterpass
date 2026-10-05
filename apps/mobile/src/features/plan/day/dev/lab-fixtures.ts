/**
 * The lab's stops for a stop's sheet: Bali, day 3 of 8, Wed Oct 14 — the terraces with the
 * driver, the ridge walk in the rain and dinner with the table held.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { type DayItem } from '@/data/plan/plan-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

const LAB_TZ = 'Asia/Makassar';

export const LAB_MEMBERS: readonly PlanMember[] = [
  { uid: 'u-winston', name: 'Winston', joinIndex: 0 },
  { uid: 'u-maya', name: 'Maya', joinIndex: 1 },
  { uid: 'u-alex', name: 'Alex', joinIndex: 2 },
  { uid: 'u-rin', name: 'Rin', joinIndex: 3 },
  { uid: 'u-jordan', name: 'Jordan', joinIndex: 4 },
  { uid: 'u-dev', name: 'Dev', joinIndex: 5 },
];

function item(
  partial: Partial<DayItem> & Pick<DayItem, 'stableId' | 'title' | 'start' | 'end'>,
): DayItem {
  return {
    dayNo: 3,
    category: 'sight',
    tz: LAB_TZ,
    lane: null,
    attendeeIds: [],
    lock: null,
    status: 'confirmed',
    byGuide: false,
    notes: null,
    poiId: null,
    place: null,
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
    ...partial,
  };
}

export const TERRACES = item({
  stableId: 'i-terraces',
  title: 'Jatiluwih terraces',
  start: 7 * 60,
  end: 11 * 60,
  category: 'nature',
  poiId: 'p-jatiluwih',
  place: { lat: -8.3706, lng: 115.1316 },
  notes: 'Driver Made picks up at the villa gate.',
  amountMinor: 3800,
  currency: 'USD',
  costModel: 'per_person',
});
export const WALK = item({
  stableId: 'i-walk',
  title: 'Ridge walk',
  start: 13 * 60,
  end: 15 * 60,
  category: 'hike',
  place: { lat: -8.5031, lng: 115.2543 },
});
export const DINNER = item({
  stableId: 'i-dinner',
  title: 'Dinner · Locavore NXT',
  start: 19 * 60 + 30,
  end: 21 * 60,
  category: 'dinner',
  lock: 'booking',
  bookingId: 'b-locavore',
  place: { lat: -8.5102, lng: 115.2632 },
});
