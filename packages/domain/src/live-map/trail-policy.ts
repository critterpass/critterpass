/**
 * Ephemeral trails (no trail is ever stored): drawn only while a member
 * moves fast (a scooter, a car, a bike, or faster than 4 m/s), holding at most the last 5 minutes
 * of points in the viewer's memory, and fading out 30 s after they stop. Never persisted, never
 * sent back to the server.
 */
import { distanceM } from '../location/geo';
import type { LocationActivity } from '../location/wire';

export const TRAIL_WINDOW_MS = 5 * 60_000;
export const TRAIL_FADE_MS = 30_000;
export const TRAIL_MIN_SPEED_MPS = 4;
/** A fix older than this is stale on the map: greyed pin, "Last seen …". */
export const STALE_FIX_MS = 5 * 60_000;

export interface TrailPoint {
  readonly lat: number;
  readonly lng: number;
  /** Epoch ms. */
  readonly at: number;
}

export interface Trail {
  readonly points: readonly TrailPoint[];
  /** Epoch ms of the last fix that counted as moving fast, or null. */
  readonly lastFastAt: number | null;
}

export const EMPTY_TRAIL: Trail = { points: [], lastFastAt: null };

/** Whether a fix counts as moving fast, from its activity or the speed since the previous fix. */
export function isMovingFast(
  activity: LocationActivity,
  previous: TrailPoint | undefined,
  next: TrailPoint,
): boolean {
  if (activity === 'automotive' || activity === 'cycling') return true;
  if (previous === undefined || next.at <= previous.at) return false;
  return distanceM(previous, next) / ((next.at - previous.at) / 1000) > TRAIL_MIN_SPEED_MPS;
}

/** Adds one fix and drops points outside the window. Returns a new trail. */
export function appendTrailPoint(
  trail: Trail,
  point: TrailPoint,
  activity: LocationActivity,
): Trail {
  const last = trail.points[trail.points.length - 1];
  if (last !== undefined && point.at <= last.at) return trail;
  const fast = isMovingFast(activity, last, point);
  const cutoff = point.at - TRAIL_WINDOW_MS;
  return {
    points: [...trail.points.filter((p) => p.at >= cutoff), point],
    lastFastAt: fast ? point.at : trail.lastFastAt,
  };
}

/** 1 while moving fast, easing to 0 over 30 s after the last fast fix; 0 with no fast fix. */
export function trailOpacity(trail: Trail, now: number): number {
  if (trail.lastFastAt === null || trail.points.length < 2) return 0;
  const since = now - trail.lastFastAt;
  if (since <= 0) return 1;
  return Math.max(0, 1 - since / TRAIL_FADE_MS);
}

/** Points still inside the 5-minute window at `now`. */
export function visibleTrailPoints(trail: Trail, now: number): readonly TrailPoint[] {
  const cutoff = now - TRAIL_WINDOW_MS;
  return trail.points.filter((p) => p.at >= cutoff);
}
