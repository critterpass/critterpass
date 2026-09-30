/**
 * The flight Live Activity's phase for one leg (docs/api-contracts-async.md §3.2; the Live
 * Activity area reads `flight_segments.la_phase` and the events below): nothing until three hours
 * before departure, then `check_in`, `boarding` from the boarding time (or the provider's BOARDING),
 * `departed` once it leaves, `landed` for the first half hour on the ground and `pickup` for the
 * ninety minutes after, then nothing again. A cancelled flight has no activity.
 */
import { z } from 'zod';

import type { FlightStatus, LaPhase } from '../bookings/kinds';

/** The pass pins itself to the lock screen this long before departure (3h-1 motion note). */
export const LA_LEAD_MS = 3 * 3_600_000;
export const LA_LANDED_MS = 30 * 60_000;
export const LA_PICKUP_MS = 2 * 3_600_000;

export interface LaSegment {
  readonly status: FlightStatus;
  readonly schedDepAt: Date;
  readonly estDepAt: Date | null;
  readonly actDepAt: Date | null;
  readonly actArrAt: Date | null;
  readonly estArrAt: Date | null;
  readonly schedArrAt: Date | null;
  readonly boardingAt: Date | null;
}

export function laPhase(segment: LaSegment, now: Date): LaPhase | null {
  const at = now.getTime();
  if (segment.status === 'cancelled') return null;
  if (segment.status === 'landed') {
    const arrived = (segment.actArrAt ?? segment.estArrAt ?? segment.schedArrAt ?? now).getTime();
    if (at < arrived + LA_LANDED_MS) return 'landed';
    return at < arrived + LA_PICKUP_MS ? 'pickup' : null;
  }
  if (segment.status === 'departed' || segment.status === 'diverted' || segment.actDepAt !== null) {
    return 'departed';
  }
  const departs = (segment.estDepAt ?? segment.schedDepAt).getTime();
  if (segment.status === 'boarding') return 'boarding';
  if (segment.boardingAt !== null && at >= segment.boardingAt.getTime()) return 'boarding';
  return at >= departs - LA_LEAD_MS ? 'check_in' : null;
}

const segmentIds = z.object({
  trip_id: z.uuid(),
  booking_id: z.uuid(),
  segment_id: z.uuid(),
});

/**
 * `boarding.soon`: a watched leg entered its Live Activity window (three hours out). The Live
 * Activity area starts the flight activity for these travellers; the wallet brightens the pass.
 */
export const boardingSoonPayloadSchema = segmentIds.extend({
  user_ids: z.array(z.uuid()).min(1),
  departs_at: z.iso.datetime({ offset: true }),
  boarding_at: z.iso.datetime({ offset: true }).nullable(),
  boarding_estimated: z.boolean(),
});
export type BoardingSoonPayload = z.infer<typeof boardingSoonPayloadSchema>;

/**
 * `flight.landed`: the leg is on the ground, from a provider or the traveller's own report. The
 * egg hatch and the trip's move to in-trip consume it; it goes out once per leg.
 */
export const flightLandedPayloadSchema = segmentIds.extend({
  user_ids: z.array(z.uuid()),
  source: z.enum(['provider', 'manual']),
});
export type FlightLandedPayload = z.infer<typeof flightLandedPayloadSchema>;

/**
 * The next-flight fields of the widget snapshot (`snapshot/widgets.json`, docs/api-contracts-
 * async.md §6): the member's next leg that has not landed, as the NEXT FLIGHT widget and the lock
 * screen show it. Pass+ gates it at render (the widget draws its locked state), not here.
 */
export const nextFlightSnapshotSchema = z.object({
  next_flight: z
    .object({
      booking_id: z.uuid(),
      segment_id: z.uuid(),
      flight: z.string(),
      from: z.string(),
      to: z.string(),
      departs_at: z.iso.datetime({ offset: true }),
      arrives_at: z.iso.datetime({ offset: true }).nullable(),
      status: z.string(),
      delay_min: z.int().nullable(),
      gate: z.string().nullable(),
      terminal: z.string().nullable(),
      la_phase: z.string().nullable(),
    })
    .nullable(),
  boarding_at: z.iso.datetime({ offset: true }).nullable(),
  boarding_estimated: z.boolean(),
});
export type NextFlightSnapshot = z.infer<typeof nextFlightSnapshotSchema>;
