/**
 * The guide's rain change set of the review screen (3e-3): Wednesday's ridge walk moved to golden
 * hour, free time swapped for a spa, the Monkey Forest moved to Thursday morning and dinner an hour
 * later (dropped), over a Wednesday and Thursday of the Bali week.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the lab and tests. */
import type { ChangeSetOp } from '@cp/domain';

import {
  ALEX,
  BALI_MEMBERS,
  BALI_TZ,
  DEV,
  JORDAN,
  MAYA,
  RIN,
  WINSTON,
} from '../../overview/dev/bali-plan';
import type { PlanDay, PlanItem } from '../../overview/model/plan-model';

export const RAIN_CHANGESET = '0199b000-0000-7000-8000-0000000cc001';

const EVERYONE = BALI_MEMBERS.map((member) => member.user_id);

function id(n: number): string {
  return `0199b000-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

/** Bali time (UTC+8) on 4 or 5 November as an instant. */
function bali(day: 4 | 5, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, day, (h ?? 0) - 8, m ?? 0)).toISOString();
}

export const RAIN_DAYS: readonly PlanDay[] = [
  { dayNo: 3, date: '2026-11-04', theme: 'Slow Ubud' },
  { dayNo: 4, date: '2026-11-05', theme: 'Batur sunrise' },
];

function item(n: number, label: string, at: string, extra: Partial<PlanItem> = {}): PlanItem {
  return {
    stableId: id(n),
    dayNo: 3,
    startsAt: bali(4, at),
    endsAt: null,
    tz: BALI_TZ,
    label,
    category: 'nature',
    poiId: id(n + 5000),
    bookingId: null,
    mustDoId: null,
    lockedReason: null,
    status: 'confirmed',
    byGuide: false,
    attendeeIds: EVERYONE,
    lat: -8.5,
    lng: 115.26,
    amountMinor: null,
    currency: null,
    costModel: null,
    ...extra,
  };
}

export const RAIN_BASE_ITEMS: readonly PlanItem[] = [
  item(801, 'Ridge walk', '14:00', { attendeeIds: [MAYA, ALEX, JORDAN] }),
  item(802, 'Free time', '14:00', { poiId: null, category: 'other', attendeeIds: [MAYA, RIN] }),
  item(803, 'Monkey Forest', '16:30', {
    bookingId: id(9803),
    attendeeIds: [WINSTON, ALEX, DEV],
  }),
  item(804, 'Locavore NXT', '19:30', { category: 'food' }),
];

export const KARSA_SPA = id(5899);

export const RAIN_POI_NAMES: ReadonlyMap<string, string> = new Map([
  [KARSA_SPA, 'Karsa Spa'],
  ...RAIN_BASE_ITEMS.flatMap((i) =>
    i.poiId === null || i.label === null ? [] : [[i.poiId, i.label] as const],
  ),
]);

export const RAIN_OPS: readonly ChangeSetOp[] = [
  {
    op: 'retime',
    target: id(801),
    before: { starts_at: bali(4, '14:00') },
    after: { starts_at: bali(4, '17:00') },
    reason: 'Rain clears by 3. Golden hour.',
    affected_user_ids: [MAYA, ALEX, JORDAN],
    booking_impact: false,
  },
  {
    op: 'swap',
    target: id(802),
    before: { starts_at: bali(4, '14:00') },
    after: {
      poi_id: KARSA_SPA,
      category: 'health',
      cost_model: 'per_person',
      amount_minor: 2_200,
      currency: 'USD',
      attendee_ids: EVERYONE,
    },
    reason: 'Maya and Rin asked for it.',
    affected_user_ids: [MAYA, RIN],
    booking_impact: false,
  },
  {
    op: 'move',
    target: id(803),
    before: { day_no: 3, starts_at: bali(4, '16:30') },
    after: { day_no: 4, starts_at: bali(5, '10:00') },
    reason: 'Dry morning, fewer crowds.',
    affected_user_ids: [WINSTON, ALEX, DEV],
    booking_impact: false,
  },
  {
    op: 'retime',
    target: id(804),
    before: { starts_at: bali(4, '19:30') },
    after: { starts_at: bali(4, '20:30') },
    reason: 'Only needed if the walk runs late.',
    affected_user_ids: [MAYA, ALEX, JORDAN, RIN, DEV, WINSTON],
    booking_impact: false,
    accepted: false,
  },
];
