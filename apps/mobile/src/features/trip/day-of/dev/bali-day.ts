/**
 * The Batur sunrise morning as fixed data for the lab scenes (3k-2, 5b-3): the Bali Six, a 03:10
 * leave-by for the 03:30 villa-gate pickup, four up and Alex and Dev asleep, at 02:48 Bali time.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import {
  buildLeaveBy,
  type CrewMember,
  type LeaveByView,
  type ReadinessRow,
} from '../../leave-by/model';
import type { PackChip } from '../packing-model';
import type { DayTimelineEntry } from '../timeline';

export const BALI_TZ = 'Asia/Makassar';
export const LAB_TRIP = '0192f000-0000-7000-8000-00000000b411';
export const LEAVE_BY = '0192f000-0000-7000-8000-0000000b0001';

export const WINSTON = '0192f000-0000-7000-8000-00000000a001';
export const MAYA = '0192f000-0000-7000-8000-00000000a002';
export const JORDAN = '0192f000-0000-7000-8000-00000000a003';
export const RIN = '0192f000-0000-7000-8000-00000000a004';
export const ALEX = '0192f000-0000-7000-8000-00000000a005';
export const DEV = '0192f000-0000-7000-8000-00000000a006';

export const BALI_CREW: readonly CrewMember[] = [
  { id: WINSTON, name: 'Winston', joinIndex: 0 },
  { id: MAYA, name: 'Maya', joinIndex: 1 },
  { id: JORDAN, name: 'Jordan', joinIndex: 2 },
  { id: RIN, name: 'Rin', joinIndex: 3 },
  { id: ALEX, name: 'Alex', joinIndex: 4 },
  { id: DEV, name: 'Dev', joinIndex: 5 },
];

/** 02:48 on Thu 15 Oct in Bali (UTC+8). */
export const AT_0248 = new Date('2026-10-14T18:48:00Z');

export function baturLeaveBy(
  options: {
    readonly now?: Date;
    readonly up?: readonly string[];
    readonly me?: string;
    readonly participants?: readonly string[];
    readonly snoozes?: number;
    readonly knocked?: boolean;
    readonly state?: string;
  } = {},
): LeaveByView {
  const up = new Set(options.up ?? [WINSTON, MAYA, JORDAN, RIN]);
  const participants = options.participants ?? BALI_CREW.map((m) => m.id);
  const me = options.me ?? WINSTON;
  const readiness: ReadinessRow[] = participants.map((id) => ({
    leave_by_id: LEAVE_BY,
    user_id: id,
    state: up.has(id) ? 'up' : 'not_up',
    snooze_count: id === me ? (options.snoozes ?? 0) : 0,
    knock_sent_at: options.knocked === true && id === ALEX ? '2026-10-14T19:10:00Z' : null,
  }));
  return buildLeaveBy({
    row: {
      id: LEAVE_BY,
      trip_id: LAB_TRIP,
      plan_item_id: null,
      title: 'Sunrise at the summit',
      place_name: 'Batur',
      local_date: '2026-10-15',
      starts_at: '2026-10-14T22:10:00Z',
      leave_at: '2026-10-14T19:10:00Z',
      pickup_at: '2026-10-14T19:30:00Z',
      tz: BALI_TZ,
      legs: JSON.stringify([
        {
          kind: 'pickup',
          minutes: 20,
          distance_m: null,
          mode: null,
          source: 'pickup',
          traffic: false,
          estimate: false,
        },
      ]),
      alarm_policy: JSON.stringify({ lead_min: 10, only_if_not_up: true, snooze_limit: 1 }),
      pickup: JSON.stringify({
        at: '2026-10-14T19:30:00Z',
        place: 'the villa gate',
        booking_id: null,
      }),
      buffer_min: 10,
      guide_note: 'Bring the headlamp, the path is dark.',
      participant_ids: JSON.stringify(participants),
      state: options.state ?? 'window',
    },
    readiness,
    members: BALI_CREW,
    me,
    now: options.now ?? AT_0248,
  });
}

/** 04:40 on Fri 2 Oct in Vietnam (UTC+7). */
export const AT_0440 = new Date('2026-10-01T21:40:00Z');

/**
 * The first morning of a Đà Nẵng trip: flight 9G 956 leaves Ho Chi Minh City at 07:05, and with
 * no place to leave from there is no travel leg, so the leave-by is stored as 04:55 (check-in two
 * hours before, less the buffer) and reads "Be at the airport by 05:05".
 */
export function airportLeaveBy(): LeaveByView {
  return buildLeaveBy({
    row: {
      id: LEAVE_BY,
      trip_id: LAB_TRIP,
      plan_item_id: null,
      title: '9G 956 SGN → DAD',
      place_name: 'Tan Son Nhat',
      local_date: '2026-10-02',
      starts_at: '2026-10-02T00:05:00Z',
      leave_at: '2026-10-01T21:55:00Z',
      pickup_at: null,
      tz: 'Asia/Ho_Chi_Minh',
      legs: JSON.stringify([{ kind: 'none', minutes: 0 }]),
      alarm_policy: JSON.stringify({ lead_min: 10, only_if_not_up: true, snooze_limit: 1 }),
      pickup: null,
      buffer_min: 10,
      guide_note: null,
      participant_ids: JSON.stringify([WINSTON]),
      state: 'window',
    },
    readiness: [
      {
        leave_by_id: LEAVE_BY,
        user_id: WINSTON,
        state: 'not_up',
        snooze_count: 0,
        knock_sent_at: null,
      },
    ],
    members: BALI_CREW.slice(0, 1),
    me: WINSTON,
    now: AT_0440,
  });
}

export const BALI_PACK: readonly PackChip[] = [
  { id: 'p1', label: 'Headlamp', packed: true, personal: false, suggested: true, pending: false },
  { id: 'p2', label: 'Warm layer', packed: true, personal: false, suggested: true, pending: false },
  {
    id: 'p3',
    label: 'Rp 50k for coffee',
    packed: false,
    personal: false,
    suggested: true,
    pending: false,
  },
  {
    id: 'p4',
    label: 'Trail shoes',
    packed: false,
    personal: true,
    suggested: false,
    pending: false,
  },
];

export const BALI_TIMELINE: readonly DayTimelineEntry[] = [
  {
    id: 't1',
    time: '06:10',
    title: 'Sunrise at the summit',
    detail: 'Guide: Ketut · 2h climb',
    dimmed: false,
  },
  {
    id: 't2',
    time: '09:30',
    title: 'Toya Devasya hot springs',
    detail: 'Tickets in Bookings',
    dimmed: false,
  },
  {
    id: 't3',
    time: '13:00',
    title: 'Nap. Tokek is guarding it.',
    detail: 'Nothing booked until 16:00',
    dimmed: false,
  },
];
