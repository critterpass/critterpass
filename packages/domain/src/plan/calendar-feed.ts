/**
 * The subscribable calendar feed of a member's own trip plan (`GET /v1/trips/{id}/calendar.ics`):
 * issuing a feed shows its secret once (only a hash is kept), revoking ends every live feed of
 * that member on that trip.
 */
import { z } from 'zod';

export const calendarFeedPayloadSchema = z.object({ trip_id: z.uuid() });

export interface CalendarFeedIssued {
  readonly trip_id: string;
  /** Path and query of the feed; the app prefixes its API origin with `webcal://`. */
  readonly path: string;
}

export function calendarFeedPath(tripId: string, token: string): string {
  return `/v1/trips/${tripId}/calendar.ics?token=${encodeURIComponent(token)}`;
}
