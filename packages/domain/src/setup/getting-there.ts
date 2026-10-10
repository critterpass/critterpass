/**
 * How each member gets to the trip (docs/api-contracts.md §4.5, `set_getting_there`): the way they
 * pick (a flight, train, bus, car or boat), where from, when they arrive, and either an estimate
 * of what it costs one person or their own booking, which replaces the estimate. The crew sees
 * everyone's way; the first day starts once the last of them has arrived.
 */
import { z } from 'zod';

export const WAY_THERE_MODES = ['flight', 'train', 'bus', 'car', 'boat', 'other'] as const;
export const wayThereModeSchema = z.enum(WAY_THERE_MODES);
export type WayThereMode = z.infer<typeof wayThereModeSchema>;

export const setGettingTherePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  mode: wayThereModeSchema,
  /** Where they leave from: an airport or city; their home airport when absent. */
  from: z.string().trim().min(1).max(80).optional(),
  /** When they arrive (local time with its offset); null clears it, absent keeps it. */
  arrives_at: z.iso.datetime({ offset: true }).nullable().optional(),
  /** Their own booking on this trip; null clears it, absent keeps it. */
  booking_id: z.uuid().nullable().optional(),
});
export type SetGettingTherePayload = z.infer<typeof setGettingTherePayloadSchema>;

export interface SetGettingThereResult {
  readonly trip_id: string;
  readonly mode: WayThereMode;
  /** One person's estimate for this way, null while it is being looked up or with a booking. */
  readonly estimate_minor: number | null;
  readonly currency: string | null;
  readonly minutes: number | null;
}

export interface ArrivalFacts {
  readonly uid: string;
  readonly arrivesAt: string | null;
}

/**
 * When the crew is all there: the latest arrival among members who said when they arrive, or
 * null when nobody has. Members who have not said do not hold the day back.
 */
export function lastArrival(arrivals: readonly ArrivalFacts[]): ArrivalFacts | null {
  let last: ArrivalFacts | null = null;
  for (const arrival of arrivals) {
    if (arrival.arrivesAt === null) continue;
    if (last === null || Date.parse(arrival.arrivesAt) > Date.parse(last.arrivesAt ?? '')) {
      last = arrival;
    }
  }
  return last;
}
