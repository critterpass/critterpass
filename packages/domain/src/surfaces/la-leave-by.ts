/**
 * The leave-by Live Activity (5a-1 lock screen, 5a-5 Dynamic Island, 3k-3): the trail from where
 * the crew sleeps to the day's first stop, Tokek's place on it, the countdown to leave and one pip
 * per member that fills when they tap I'M UP. One ContentState serves the whole crew (it goes out
 * on the leave-by's broadcast channel), so it never names the viewer: each device finds its own
 * pip by hashing its uid (`laMemberHash`).
 */
import { z } from 'zod';

import type { LeaveByState } from '../trip-day/leave-by';
import { isAwake, type ReadinessState } from '../trip-day/readiness';
import {
  laLine,
  laMemberHash,
  memberHashSchema,
  unixSeconds,
  unixSecondsSchema,
} from './la-common';

export const LA_LEAVE_BY_STATES = ['waiting', 'soon', 'go', 'late', 'done'] as const;
export type LaLeaveByState = (typeof LA_LEAVE_BY_STATES)[number];

/** The server push-to-starts a leave-by activity this long before leave time. */
export const LA_LEAVE_BY_LEAD_MS = 3 * 3_600_000;
/** The countdown turns to "soon" this long before leaving (the leave-by's own window). */
export const LA_LEAVE_BY_SOON_MS = 30 * 60_000;
/** Past leave time by this much with someone still asleep, the activity reads "late". */
export const LA_LEAVE_BY_LATE_MS = 5 * 60_000;
/** Most crew pips a leave-by shows (a 16-member crew). */
export const LA_MAX_PIPS = 16;
/** Tokek's progress within a leg, in steps (discrete: updates, never animation). */
export const LA_PROGRESS_STEPS = 10;

export const leaveByLaAttributesSchema = z.object({
  trip_id: z.uuid(),
  leave_by_id: z.uuid(),
  title: z.string().max(60),
  /** Trail stops, first to last ("Villa", "Pickup", "Trailhead", "Summit"). */
  legs: z.array(z.string().max(24)).min(2).max(4),
});
export type LeaveByLaAttributes = z.infer<typeof leaveByLaAttributesSchema>;

export const leaveByLaPipSchema = z.object({ uid_hash: memberHashSchema, up: z.boolean() });

export const leaveByLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  leave_at: unixSecondsSchema,
  state: z.enum(LA_LEAVE_BY_STATES),
  up_count: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  pips: z.array(leaveByLaPipSchema).max(LA_MAX_PIPS),
  /** Index of the trail stop Tokek has reached. */
  leg: z.number().int().nonnegative(),
  /** Steps (0–10) from that stop toward the next one. */
  progress: z.number().int().min(0).max(LA_PROGRESS_STEPS),
  /** "Pickup at the villa gate". */
  place_line: z.string().max(80),
  guide_line: z.string().max(120),
});
export type LeaveByLaState = z.infer<typeof leaveByLaStateSchema>;

export interface LeaveByLaInput {
  readonly leaveById: string;
  readonly tripId: string;
  readonly title: string;
  readonly placeName: string | null;
  readonly pickupPlace: string | null;
  readonly hasPickup: boolean;
  readonly leaveAt: Date;
  readonly state: LeaveByState;
  /** Travel minutes of each routed leg after leaving (for Tokek's walk). */
  readonly legMinutes: readonly number[];
  readonly participants: readonly { readonly uid: string; readonly readiness: ReadinessState }[];
  readonly guideLine: string;
  /** Localised stop names the attributes fall back to. */
  readonly labels: { readonly stay: string; readonly pickup: string };
}

export function buildLeaveByLaAttributes(input: LeaveByLaInput): LeaveByLaAttributes {
  const place = input.placeName?.trim() ?? '';
  const candidates = [
    input.labels.stay,
    input.hasPickup ? input.labels.pickup : '',
    place === '' ? '' : laLine(place, 24),
    laLine(input.title, 24),
  ];
  const legs: string[] = [];
  for (const stop of candidates) {
    if (stop !== '' && !legs.includes(stop) && legs.length < 4) legs.push(stop);
  }
  if (legs.length < 2) legs.push(input.labels.pickup);
  return {
    trip_id: input.tripId,
    leave_by_id: input.leaveById,
    title: laLine(input.title, 60),
    legs,
  };
}

/**
 * Waiting, then "soon" in the last half hour, "go" from leave time ("late" once five minutes pass
 * with someone still asleep), "done" when the trail is walked or the leave-by is cancelled. The
 * leave-by itself turns `departed` at leave time; the activity keeps going with the crew.
 */
export function leaveByLaPhase(input: LeaveByLaInput, now: Date): LaLeaveByState {
  if (input.state === 'cancelled') return 'done';
  const until = input.leaveAt.getTime() - now.getTime();
  if (until > LA_LEAVE_BY_SOON_MS) return 'waiting';
  if (until > 0) return 'soon';
  if (-until >= leaveByLaTrailMs(input)) return 'done';
  const everyoneUp = input.participants.every((p) => isAwake(p.readiness));
  return -until >= LA_LEAVE_BY_LATE_MS && !everyoneUp ? 'late' : 'go';
}

/** How long after leave time the trail takes to walk (at least half an hour). */
export function leaveByLaTrailMs(input: LeaveByLaInput): number {
  const minutes = input.legMinutes.reduce((sum, leg) => sum + Math.max(1, leg), 0);
  return Math.max(30, minutes) * 60_000;
}

/** Tokek's stop and step: before leaving he walks toward the first leg as the window drains. */
export function leaveByLaPosition(
  input: LeaveByLaInput,
  now: Date,
  stops: number,
): { leg: number; progress: number } {
  const at = now.getTime();
  const leave = input.leaveAt.getTime();
  if (at < leave) {
    const drained = 1 - Math.min(1, (leave - at) / LA_LEAVE_BY_SOON_MS);
    return { leg: 0, progress: Math.floor(drained * (LA_PROGRESS_STEPS / 2)) };
  }
  let elapsedMin = (at - leave) / 60_000;
  const legs = input.legMinutes.slice(0, Math.max(0, stops - 1));
  for (let index = 0; index < legs.length; index += 1) {
    const minutes = Math.max(1, legs[index] ?? 1);
    if (elapsedMin < minutes) {
      return { leg: index, progress: Math.floor((elapsedMin / minutes) * LA_PROGRESS_STEPS) };
    }
    elapsedMin -= minutes;
  }
  return { leg: Math.max(0, stops - 1), progress: 0 };
}

export function buildLeaveByLaState(input: LeaveByLaInput, now: Date, seq: number): LeaveByLaState {
  const pips = input.participants
    .slice(0, LA_MAX_PIPS)
    .map((p) => ({ uid_hash: laMemberHash(input.leaveById, p.uid), up: isAwake(p.readiness) }));
  const stops = buildLeaveByLaAttributes(input).legs.length;
  const { leg, progress } = leaveByLaPosition(input, now, stops);
  const place = input.pickupPlace ?? input.placeName ?? input.title;
  return {
    seq,
    leave_at: unixSeconds(input.leaveAt),
    state: leaveByLaPhase(input, now),
    up_count: input.participants.filter((p) => isAwake(p.readiness)).length,
    total: input.participants.length,
    pips,
    leg,
    progress,
    place_line: laLine(place, 80),
    guide_line: laLine(input.guideLine, 120),
  };
}
