/**
 * The lab's fixed day: Bali, day 3 of 8, "Slow Ubud" on Wed Oct 14 as 3e-2 draws it — the
 * terraces with the driver, a lunch still in a vote, the ridge walk in the rain, the spa for Maya
 * and Rin in their own lane, and dinner with the table held.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { StackMember } from '@/ui/people/AvatarStack';

import type { DayItem } from '../plan-model';
import type { PlanMember } from '../use-trip-plan';

export const LAB_DATE = '2026-10-14';
export const LAB_TZ = 'Asia/Makassar';

export const LAB_MEMBERS: readonly PlanMember[] = [
  { uid: 'u-winston', name: 'Winston', joinIndex: 0 },
  { uid: 'u-maya', name: 'Maya', joinIndex: 1 },
  { uid: 'u-alex', name: 'Alex', joinIndex: 2 },
  { uid: 'u-rin', name: 'Rin', joinIndex: 3 },
  { uid: 'u-jordan', name: 'Jordan', joinIndex: 4 },
  { uid: 'u-dev', name: 'Dev', joinIndex: 5 },
];

export const LAB_HERE: readonly StackMember[] = [
  { key: 'u-maya', name: 'Maya', joinIndex: 1 },
  { key: 'u-alex', name: 'Alex', joinIndex: 2 },
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
export const LUNCH = item({
  stableId: 'i-lunch',
  title: 'Lunch · Biah Biah',
  start: 11 * 60 + 30,
  end: 12 * 60 + 45,
  category: 'food',
  status: 'voting',
  place: { lat: -8.5069, lng: 115.2625 },
});
export const WALK = item({
  stableId: 'i-walk',
  title: 'Ridge walk',
  start: 14 * 60,
  end: 15 * 60 + 15,
  category: 'hike',
  place: { lat: -8.5031, lng: 115.2543 },
});
export const SPA = item({
  stableId: 'i-spa',
  title: 'Karsa spa',
  start: 15 * 60 + 30,
  end: 17 * 60 + 45,
  category: 'spa',
  lane: 'maya-rin',
  attendeeIds: ['u-maya', 'u-rin'],
  place: { lat: -8.4948, lng: 115.2511 },
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

export const LAB_ITEMS: readonly DayItem[] = [TERRACES, LUNCH, WALK, SPA, DINNER];

export const LAB_META: Readonly<Record<string, string>> = {
  'i-terraces': '07:00–11:00 · driver Made',
  'i-lunch': '4 of 6 voted',
  'i-walk': '14:00 · in the rain',
  'i-spa': 'Maya, Rin',
  'i-dinner': '19:30 · table held',
};
