/**
 * The leave-by time (docs/product-decisions.md, leave-by rule): `leave_at` = the item's start, or
 * the pickup when the crew is collected, minus travel, minus the buffer (10 minutes unless the
 * organiser changed it). All arithmetic runs on instants, so a daylight-saving change between
 * leaving and arriving costs real minutes, never wall-clock ones; the result is floored to five
 * minutes (every zone offset is a multiple of five, so the local clock reads a round time too).
 */
import { DEFAULT_LEAVE_BY_BUFFER_MIN, toLocalWallTime } from '@cp/domain';

const MINUTE = 60_000;
const ROUND = 5 * MINUTE;

/** Items in these categories always get a leave-by, whatever the hour. */
export const ALWAYS_LEAVE_BY_CATEGORIES: ReadonlySet<string> = new Set([
  'flight',
  'transfer',
  'airport',
  'train',
  'ferry',
]);

/** Items starting before this local hour are early starts. */
export const EARLY_START_HOUR = 8;
/** A long trip to the item earns a leave-by too. */
export const LONG_TRAVEL_MIN = 45;
/** How long before a flight the crew should be at the airport. */
export const FLIGHT_ARRIVE_EARLY_MIN = 120;

export interface LeaveByCandidate {
  readonly startsAt: Date;
  readonly tz: string;
  readonly category: string | null;
  /** The organiser marked the item early. */
  readonly flaggedEarly?: boolean;
}

/** Whether an item gets a leave-by: an early start, a transfer or flight, a flag, or a long trip. */
export function isLeaveByEligible(item: LeaveByCandidate, travelMinutes: number | null): boolean {
  if (item.flaggedEarly === true) return true;
  if (item.category !== null && ALWAYS_LEAVE_BY_CATEGORIES.has(item.category)) return true;
  const hour = Number(toLocalWallTime(item.startsAt, item.tz).time.slice(0, 2));
  if (hour < EARLY_START_HOUR) return true;
  return travelMinutes !== null && travelMinutes > LONG_TRAVEL_MIN;
}

/** Minutes to be there before the item starts (check-in for a flight). */
export function arriveEarlyMinutes(category: string | null): number {
  return category === 'flight' ? FLIGHT_ARRIVE_EARLY_MIN : 0;
}

export interface ComputeLeaveByInput {
  readonly startsAt: Date;
  /** When a pickup collects the crew; the leave-by then targets the pickup, not the start. */
  readonly pickupAt: Date | null;
  readonly travelMinutes: number;
  readonly bufferMin?: number;
  readonly arriveEarlyMin?: number;
  readonly tz: string;
}

export interface ComputedLeaveBy {
  readonly leaveAt: Date;
  /** The instant the crew must be at the item or pickup. */
  readonly targetAt: Date;
  /** The trip day the leave-by belongs to: the item's local date. */
  readonly localDate: string;
  /** `HH:MM` on the item's local clock. */
  readonly localTime: string;
}

export function computeLeaveBy(input: ComputeLeaveByInput): ComputedLeaveBy {
  const buffer = input.bufferMin ?? DEFAULT_LEAVE_BY_BUFFER_MIN;
  const early = input.arriveEarlyMin ?? 0;
  const target = input.pickupAt ?? new Date(input.startsAt.getTime() - early * MINUTE);
  const latest = Math.min(target.getTime(), input.startsAt.getTime());
  const raw = latest - (Math.max(0, input.travelMinutes) + Math.max(0, buffer)) * MINUTE;
  const leaveAt = new Date(Math.floor(raw / ROUND) * ROUND);
  return {
    leaveAt,
    targetAt: new Date(latest),
    localDate: toLocalWallTime(input.startsAt, input.tz).date,
    localTime: toLocalWallTime(leaveAt, input.tz).time.slice(0, 5),
  };
}
