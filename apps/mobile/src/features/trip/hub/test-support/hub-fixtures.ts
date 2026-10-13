/**
 * Fixed data for the trip hub's lab scenes: the Bali trip's clock, briefing lines, ticker, flight,
 * leave-by and next stop. Text the guide or the crew wrote stays as written; everything the app
 * words itself is built by the scenes from the catalog.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { BriefingLine } from '../../briefing/briefing-model';
import type { LeaveByRow } from '../../leave-by/model';

/** Sep 25, 18:33:31 Bali time: 17 days, 5 h 26 min 29 s before the first flight. */
export const NOW = new Date('2026-09-25T10:33:31Z');
export const WHEELS_UP = new Date('2026-10-12T16:00:00Z');

export const LINES: readonly BriefingLine[] = [
  {
    id: 'b1',
    icon: 'plane',
    text: "Rin's flight moved to 22:40. I moved her pickup to match.",
    action: 'done',
    status: 'open',
    targets: [],
    deepLink: null,
  },
  {
    id: 'b2',
    icon: 'wallet',
    text: "Visa on arrival is $35, cash only. Dev and Alex haven't got any yet.",
    action: 'nudge',
    status: 'open',
    targets: [],
    deepLink: null,
  },
  {
    id: 'b3',
    icon: 'key',
    text: "The villa door code arrives Oct 11. I'll pin it to Day 1.",
    action: 'set',
    status: 'open',
    targets: [],
    deepLink: null,
  },
];

export const TICKER = [
  'Alex moved snorkelling to 14:00',
  'Maya voted Nusa Penida',
  'Tokek held 6 boat seats',
  'Jordan added 12 photos',
].map((text, index) => ({ id: `a${index}`, text }));

export const TZ = 'Asia/Makassar';
export const TODAY = '2026-09-25';

/** The trip's day and stop fixtures for the scenes that are in the trip. */
/** Today's leave-by with its travel worked out (a drive to the trailhead). */
export const LEAVE_BY: LeaveByRow = {
  id: 'l1',
  trip_id: 't1',
  plan_item_id: null,
  title: null,
  place_name: 'Batur',
  local_date: '2026-10-14',
  starts_at: '2026-10-13T20:30:00Z',
  leave_at: '2026-10-13T19:10:00Z',
  pickup_at: null,
  tz: TZ,
  legs: JSON.stringify([{ kind: 'drive', minutes: 70 }]),
  alarm_policy: null,
  pickup: null,
  buffer_min: 10,
  guide_note: null,
  participant_ids: null,
  state: 'scheduled',
};
export const STOP = {
  stable_id: 's1',
  starts_at: '2026-10-13T02:00:00Z',
  tz: TZ,
  notes: null,
  category: null,
  poi_name: 'Tegallalang',
  day_date: '2026-10-13',
};
export const FLIGHT = {
  id: 'f',
  title: 'SQ 938 Singapore to Denpasar',
  departsAt: new Date('2026-09-25T09:00:00Z'),
  arrivesAt: new Date('2026-09-25T13:43:31Z'),
};
