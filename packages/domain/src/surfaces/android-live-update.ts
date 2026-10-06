/**
 * Android Live Updates (docs/api-contracts-async.md §3.2, Android row): the same ContentState the
 * iOS Live Activity draws, turned into what `Notification.ProgressStyle` (API 36) and
 * `MetricStyle` (API 37) take: segments, points, a progress value, the status-bar chip and up to
 * three metrics. The worker derives it next to the ContentState and sends both in the FCM data
 * message; the app's renderer (cp-android-surfaces `ProgressSpec.kt`) only draws it. Labels are
 * keys the app localises; the only free text is data the activity already shows (place, flight).
 */
import { z } from 'zod';

import type { LaKind } from './la-common';
import { LA_CRITTER_RING_STEPS, type CritterLaState } from './la-critter';
import type { FlightLaAttributes, FlightLaState } from './la-flight';
import { LA_PROGRESS_STEPS, type LeaveByLaAttributes, type LeaveByLaState } from './la-leave-by';
import { LA_MEET_UP_STEPS, type MeetUpLaAttributes, type MeetUpLaState } from './la-meetup';
import type { SosLaAttributes, SosLaState } from './la-sos';

/** Colour roles the renderer maps to the guide palette. */
export const PROGRESS_TONES = ['done', 'ahead', 'alert', 'stop', 'member', 'me'] as const;
const toneSchema = z.enum(PROGRESS_TONES);

/** Metric labels the app localises (`cp_lu_metric_<key>`). */
export const PROGRESS_METRIC_KEYS = [
  'leave_in',
  'up',
  'boarding_in',
  'departs_in',
  'lands_in',
  'delay',
  'eta',
  'stay',
  'coming',
] as const;

export const progressSpecSchema = z.object({
  /** `metric` asks for MetricStyle where the OS has it (37+); ProgressStyle is the fallback. */
  style: z.enum(['progress', 'metric']),
  /** Localised status line key (`cp_lu_status_<kind>_<status>`). */
  status: z.string().regex(/^[a-z_]{2,40}$/),
  /** Data the activity already shows: place line, flight and route, the SOS sender. */
  title: z.string().max(80),
  segments: z
    .array(z.object({ length: z.number().int().positive(), tone: toneSchema }))
    .min(1)
    .max(8),
  points: z.array(z.object({ position: z.number().int().nonnegative(), tone: toneSchema })).max(8),
  progress: z.number().int().nonnegative(),
  indeterminate: z.boolean(),
  /**
   * Status-bar chip: a countdown to `until` (unix seconds), minutes away, a tally, or a short label
   * key the app localises.
   */
  chip: z.union([
    z.object({ until: z.number().int().nonnegative() }),
    z.object({ min: z.number().int().nonnegative() }),
    z.object({ key: z.string().regex(/^[a-z_]{2,24}$/) }),
    z.object({ count: z.number().int().nonnegative(), of: z.number().int().nonnegative() }),
  ]),
  metrics: z
    .array(
      z.object({
        key: z.enum(PROGRESS_METRIC_KEYS),
        value: z.number(),
        unit: z.enum(['min', 'count']),
      }),
    )
    .max(3),
});
export type ProgressSpec = z.infer<typeof progressSpecSchema>;
type Segment = ProgressSpec['segments'][number];
type Point = ProgressSpec['points'][number];

const minutesUntil = (at: number, nowSec: number): number =>
  Math.max(0, Math.ceil((at - nowSec) / 60));

/** Stop-to-stop legs, each `LA_PROGRESS_STEPS` long; Tokek's step is the progress. */
export function leaveByProgressSpec(
  attributes: Pick<LeaveByLaAttributes, 'legs'>,
  state: LeaveByLaState,
  now: Date,
): ProgressSpec {
  const legs = Math.max(1, attributes.legs.length - 1);
  const progress = Math.min(
    legs * LA_PROGRESS_STEPS,
    state.leg * LA_PROGRESS_STEPS + state.progress,
  );
  const segments: Segment[] = Array.from({ length: legs }, (_, index) => ({
    length: LA_PROGRESS_STEPS,
    tone: index < state.leg ? 'done' : 'ahead',
  }));
  const points: Point[] = Array.from({ length: legs + 1 }, (_, index) => ({
    position: index * LA_PROGRESS_STEPS,
    tone: 'stop',
  }));
  const nowSec = Math.floor(now.getTime() / 1000);
  const before = state.state === 'waiting' || state.state === 'soon';
  return progressSpecSchema.parse({
    style: 'metric',
    status: `leave_by_${state.state}`,
    title: state.place_line,
    segments,
    points,
    progress,
    indeterminate: false,
    chip: before ? { until: state.leave_at } : { count: state.up_count, of: state.total },
    metrics: [
      ...(before
        ? [{ key: 'leave_in', value: minutesUntil(state.leave_at, nowSec), unit: 'min' }]
        : []),
      { key: 'up', value: state.up_count, unit: 'count' },
    ],
  });
}

const FLIGHT_STEPS = ['check_in', 'boarding', 'departed', 'landed', 'pickup'] as const;

/** Check-in → boarding → in the air → landed → pickup; the flight leg fills with time aloft. */
export function flightProgressSpec(
  attributes: Pick<FlightLaAttributes, 'flight_no' | 'route'>,
  state: FlightLaState,
  now: Date,
): ProgressSpec {
  const nowSec = Math.floor(now.getTime() / 1000);
  const departs = state.est ?? state.sched;
  const broken = state.phase === 'cancelled' || state.phase === 'diverted';
  const phase = broken ? 0 : FLIGHT_STEPS.indexOf(state.phase as (typeof FLIGHT_STEPS)[number]);
  let progress = phase * LA_PROGRESS_STEPS;
  if (state.phase === 'departed' && state.arr_at !== null && state.arr_at > departs) {
    const aloft = (nowSec - departs) / (state.arr_at - departs);
    progress += Math.floor(Math.min(1, Math.max(0, aloft)) * LA_PROGRESS_STEPS);
  }
  const chip =
    state.phase === 'check_in' && state.boarding_at !== null
      ? { until: state.boarding_at }
      : state.phase === 'boarding'
        ? { until: departs }
        : state.phase === 'departed' && state.arr_at !== null
          ? { until: state.arr_at }
          : { key: state.phase };
  const metrics: ProgressSpec['metrics'] = [];
  if (state.phase === 'check_in' && state.boarding_at !== null) {
    metrics.push({
      key: 'boarding_in',
      value: minutesUntil(state.boarding_at, nowSec),
      unit: 'min',
    });
  } else if (state.phase === 'boarding') {
    metrics.push({ key: 'departs_in', value: minutesUntil(departs, nowSec), unit: 'min' });
  } else if (state.phase === 'departed' && state.arr_at !== null) {
    metrics.push({ key: 'lands_in', value: minutesUntil(state.arr_at, nowSec), unit: 'min' });
  }
  if (state.delay_min !== null && state.delay_min > 0) {
    metrics.push({ key: 'delay', value: state.delay_min, unit: 'min' });
  }
  return progressSpecSchema.parse({
    style: 'metric',
    status: `flight_${state.phase}`,
    title: `${attributes.flight_no} · ${attributes.route}`,
    segments: FLIGHT_STEPS.slice(1).map((_, index) => ({
      length: LA_PROGRESS_STEPS,
      tone: broken ? 'alert' : index < phase ? 'done' : 'ahead',
    })),
    points: FLIGHT_STEPS.map((_, index) => ({ position: index * LA_PROGRESS_STEPS, tone: 'stop' })),
    progress,
    indeterminate: false,
    chip,
    metrics,
  });
}

/** The crew closing in on the flag: progress is the furthest member, one point per member. */
export function meetUpProgressSpec(
  attributes: Pick<MeetUpLaAttributes, 'place_name'>,
  state: MeetUpLaState,
): ProgressSpec {
  const out = state.members.filter((member) => !member.arrived);
  const furthest = out.reduce((max, member) => Math.max(max, member.step), 0);
  return progressSpecSchema.parse({
    style: 'progress',
    status: `meet_up_${state.state}`,
    title: attributes.place_name,
    segments: [{ length: LA_MEET_UP_STEPS, tone: state.state === 'late' ? 'alert' : 'ahead' }],
    points: state.members.slice(0, 8).map((member) => ({
      position: LA_MEET_UP_STEPS - member.step,
      tone: member.arrived ? 'done' : 'member',
    })),
    progress: LA_MEET_UP_STEPS - furthest,
    indeterminate: false,
    chip:
      state.eta_min === null
        ? { count: state.members.length - out.length, of: state.members.length }
        : { min: state.eta_min },
    metrics: state.eta_min === null ? [] : [{ key: 'eta', value: state.eta_min, unit: 'min' }],
  });
}

/** The dwell ring filling while the viewer stays put. */
export function critterProgressSpec(placeName: string | null, state: CritterLaState): ProgressSpec {
  return progressSpecSchema.parse({
    style: 'progress',
    status: `critter_${state.state}`,
    title: placeName ?? '',
    segments: [{ length: LA_CRITTER_RING_STEPS, tone: 'ahead' }],
    points: [],
    progress: state.ring,
    indeterminate: false,
    chip: { key: state.distance_band },
    metrics:
      state.remain_min === null ? [] : [{ key: 'stay', value: state.remain_min, unit: 'min' }],
  });
}

/** The sender's own SOS: open until someone answers, then how many are coming. */
export function sosProgressSpec(
  attributes: Pick<SosLaAttributes, 'sender_name'>,
  state: SosLaState,
): ProgressSpec {
  return progressSpecSchema.parse({
    style: 'progress',
    status: `sos_${state.state}`,
    title: attributes.sender_name,
    segments: [{ length: 1, tone: 'alert' }],
    points: [],
    progress: state.state === 'resolved' ? 1 : 0,
    indeterminate: state.state === 'open',
    chip: { key: 'sos' },
    metrics: [{ key: 'coming', value: state.responders, unit: 'count' }],
  });
}

/** Kinds Android shows as a Live Update for someone (vote and storm are notifications only). */
export const ANDROID_LIVE_UPDATE_KINDS = [
  'leave_by',
  'flight',
  'meet_up',
  'critter_nearby',
  'sos',
] as const;
export type AndroidLiveUpdateKind = (typeof ANDROID_LIVE_UPDATE_KINDS)[number];

export function isAndroidLiveUpdateKind(kind: LaKind): kind is AndroidLiveUpdateKind {
  return (ANDROID_LIVE_UPDATE_KINDS as readonly string[]).includes(kind);
}

/**
 * The spec for one ContentState, or null for a kind Android does not draw as a Live Update or a
 * state that does not parse (the device then shows the notification fallback).
 */
export function androidProgressSpec(
  kind: LaKind,
  attributes: Readonly<Record<string, unknown>>,
  contentState: Readonly<Record<string, unknown>>,
  now: Date,
): ProgressSpec | null {
  const a = attributes as never;
  const s = contentState as never;
  try {
    switch (kind) {
      case 'leave_by':
        return leaveByProgressSpec(a, s, now);
      case 'flight':
        return flightProgressSpec(a, s, now);
      case 'meet_up':
        return meetUpProgressSpec(a, s);
      case 'critter_nearby':
        return critterProgressSpec(
          (attributes['place_name'] as string | null | undefined) ?? null,
          s,
        );
      case 'sos':
        return sosProgressSpec(a, s);
      case 'vote':
      case 'storm':
      case 'alarm':
      case 'ride':
        return null;
    }
  } catch {
    return null;
  }
}
