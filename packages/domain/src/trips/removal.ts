/**
 * Ending a trip before it happens. An organiser deletes a trip still in setup that nobody else is
 * on (it is removed, rows and all) or cancels any other trip that has not started (`cancelled`:
 * kept to read, nothing new added); a member who is not an organiser leaves a trip, which is the
 * same as answering OUT (the seat frees and the money re-splits without them).
 */
import { z } from 'zod';

import type { TripStatus } from '../enums/trip';

const tripIdPayload = z.object({ trip_id: z.uuid() });

export const deleteTripPayloadSchema = tripIdPayload;
export type DeleteTripPayload = z.infer<typeof deleteTripPayloadSchema>;
export interface DeleteTripResult {
  readonly trip_id: string;
  readonly deleted: true;
}

export const cancelTripPayloadSchema = tripIdPayload;
export type CancelTripPayload = z.infer<typeof cancelTripPayloadSchema>;
export interface CancelTripResult {
  readonly trip_id: string;
  readonly status: 'cancelled';
  /** False when the trip was already cancelled (a replay or another organiser). */
  readonly cancelled: boolean;
}

export const leaveTripPayloadSchema = tripIdPayload;
export type LeaveTripPayload = z.infer<typeof leaveTripPayloadSchema>;
export interface LeaveTripResult {
  readonly trip_id: string;
  readonly rsvp: 'out';
}

/** The statuses an organiser may cancel from (the trip state machine's edges into `cancelled`). */
export const CANCELLABLE_TRIP_STATUSES: ReadonlySet<TripStatus> = new Set([
  'setup',
  'proposed',
  'confirmed',
  'pre_trip',
]);

/** A trip a member may still leave: not yet under way, finished or cancelled. */
export const LEAVABLE_TRIP_STATUSES: ReadonlySet<TripStatus> = new Set([
  'voting',
  'won',
  'setup',
  'drafting',
  'draft_review',
  'redrafting',
  'proposed',
  'confirmed',
  'pre_trip',
]);

/** What the trip menu offers the reader for a trip in `status`, by role. */
export type TripRemoval = 'delete' | 'cancel' | 'leave';

export function tripRemovals(input: {
  readonly status: string;
  readonly organiser: boolean;
  /** Anyone else on the trip who has not answered OUT. */
  readonly othersOnTrip: number;
}): readonly TripRemoval[] {
  const status = input.status as TripStatus;
  if (!input.organiser) return LEAVABLE_TRIP_STATUSES.has(status) ? ['leave'] : [];
  if (status === 'setup' && input.othersOnTrip === 0) return ['delete'];
  return CANCELLABLE_TRIP_STATUSES.has(status) ? ['cancel'] : [];
}
