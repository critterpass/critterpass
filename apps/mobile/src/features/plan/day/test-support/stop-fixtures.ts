/** A crew and a stop for the stop sheet's tests: Bali, day 3, the ridge walk. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, never copy. */
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

export const WALK = item({
  stableId: 'i-walk',
  title: 'Ridge walk',
  start: 13 * 60,
  end: 15 * 60,
  category: 'hike',
  place: { lat: -8.5031, lng: 115.2543 },
});
