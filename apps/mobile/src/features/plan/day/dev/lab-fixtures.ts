/**
 * The lab's fixed day: Bali, day 3 of 8, "Slow Ubud" on Wed Oct 14 as 3e-2 draws it — the
 * terraces with the driver, a lunch still in a vote, the ridge walk in the rain, the spa for Maya
 * and Rin in their own lane, and dinner with the table held.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { i18n } from '@lingui/core';
import type { StackMember } from '@/ui/people/AvatarStack';

import type { PlaceRow } from '../queries';
import { type DayItem } from '@/data/plan/plan-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

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
  start: 11 * 60,
  end: 12 * 60 + 30,
  category: 'food',
  status: 'voting',
});
export const WALK = item({
  stableId: 'i-walk',
  title: 'Ridge walk',
  start: 13 * 60,
  end: 15 * 60,
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

const LAB_META: Readonly<Record<string, string>> = {
  'i-terraces': '07:00–11:00 · driver Made',
  'i-lunch': '4 of 6 voted',
  'i-walk': '14:00 · in the rain',
  'i-spa': 'Maya, Rin',
  'i-dinner': '19:30 · table held',
};

const LAB_META_VI: Readonly<Record<string, string>> = {
  'i-terraces': '07:00–11:00 · tài xế Made',
  'i-lunch': '4/6 đã bình chọn',
  'i-walk': '14:00 · trời mưa',
  'i-spa': 'Maya, Rin',
  'i-dinner': '19:30 · đã giữ bàn',
};

/** The meta line a lab item shows, in the lab's current language like a real trip's data. */
export function labMeta(item: DayItem): string {
  const meta = i18n.locale.startsWith('vi') ? LAB_META_VI : LAB_META;
  return meta[item.stableId] ?? '';
}

/** The moved walk's line in the guide's suggestion, in the lab's current language. */
export function labGhostDetail(): string {
  return i18n.locale.startsWith('vi') ? '17:00 · giờ vàng' : '17:00 · golden hour';
}

const TEMPLES = [
  'Pura Batukaru',
  'Pura Besakih',
  'Pura Dalem Ubud',
  'Pura Desa Ubud',
  'Pura Goa Gajah',
  'Pura Gunung Kawi',
  'Pura Gunung Lebah',
  'Pura Lempuyang',
  'Pura Luhur Uluwatu',
  'Pura Tanah Lot',
  'Pura Taman Ayun',
  'Pura Taman Saraswati',
  'Pura Tirta Empul',
  'Pura Ulun Danu Bratan',
];

/** The add sheet's catalogue: enough temples that a search for "pura" runs past the sheet. */
export const LAB_PLACES: readonly PlaceRow[] = TEMPLES.map((name, index) => ({
  id: `p-pura-${index + 1}`,
  name,
  category: 'temple',
  lat: null,
  lng: null,
}));
