/**
 * The flight-day Live Activity (5a-3) for any flight in the wallet, however it got there: it
 * starts three hours before departure, counts down to boarding (orange from ten minutes out),
 * follows gate and delay changes, and on landing turns into the pickup card (the booked transfer's
 * name, or a Grab hand-off when nothing is booked). The "from your email" badge marks mailbox
 * imports only (a Pass+ feature); every other source gets the same activity without it.
 */
import { z } from 'zod';

import type { BookingSource, FlightStatus } from '../bookings/kinds';
import { laPhase, LA_PICKUP_MS } from '../flights/la-phase';
import { laLine, unixSeconds, unixSecondsSchema } from './la-common';

export const LA_FLIGHT_PHASES = [
  'check_in',
  'boarding',
  'departed',
  'landed',
  'pickup',
  'cancelled',
  'diverted',
] as const;
export type LaFlightPhase = (typeof LA_FLIGHT_PHASES)[number];

export const LA_FLIGHT_COLOURS = ['default', 'orange', 'red'] as const;

/** The countdown turns orange this long before boarding. */
export const LA_FLIGHT_ORANGE_MS = 10 * 60_000;

export const flightLaAttributesSchema = z.object({
  booking_id: z.uuid(),
  segment_id: z.uuid(),
  /** "SQ 938". */
  flight_no: z.string().max(10),
  /** "SIN → DPS". */
  route: z.string().max(12),
  from: z.string().length(3),
  to: z.string().length(3),
  /** Mailbox import: shows "from your email" and the Pass+ badge. */
  from_email: z.boolean(),
});
export type FlightLaAttributes = z.infer<typeof flightLaAttributesSchema>;

export const flightLaPickupSchema = z.object({
  /** "Made" (the transfer's operator or driver, as booked). */
  name: z.string().max(40),
  /** "Door 3 with a sign · Silver Avanza, DK 1842 AB". */
  line: z.string().max(80),
});

export const flightLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  phase: z.enum(LA_FLIGHT_PHASES),
  sched: unixSecondsSchema,
  est: unixSecondsSchema.nullable(),
  boarding_at: unixSecondsSchema.nullable(),
  arr_at: unixSecondsSchema.nullable(),
  gate: z.string().max(8).nullable(),
  terminal: z.string().max(8).nullable(),
  seat: z.string().max(8).nullable(),
  delay_min: z.number().int().nullable(),
  colour: z.enum(LA_FLIGHT_COLOURS),
  pickup: flightLaPickupSchema.nullable(),
  /** Nothing booked for the ride on: offer the Grab hand-off. */
  grab_cta: z.boolean(),
});
export type FlightLaState = z.infer<typeof flightLaStateSchema>;

export interface FlightLaInput {
  readonly bookingId: string;
  readonly segmentId: string;
  readonly carrier: string;
  readonly flightNo: string;
  readonly depAirport: string;
  readonly arrAirport: string;
  readonly source: BookingSource;
  readonly status: FlightStatus;
  readonly schedDepAt: Date;
  readonly estDepAt: Date | null;
  readonly actDepAt: Date | null;
  readonly schedArrAt: Date | null;
  readonly estArrAt: Date | null;
  readonly actArrAt: Date | null;
  readonly boardingAt: Date | null;
  readonly gate: string | null;
  readonly terminal: string | null;
  readonly seat: string | null;
  readonly delayMin: number | null;
  readonly pickup: { readonly name: string; readonly line: string } | null;
}

export function buildFlightLaAttributes(input: FlightLaInput): FlightLaAttributes {
  return {
    booking_id: input.bookingId,
    segment_id: input.segmentId,
    flight_no: `${input.carrier} ${input.flightNo}`,
    route: `${input.depAirport} → ${input.arrAirport}`,
    from: input.depAirport,
    to: input.arrAirport,
    from_email: input.source === 'mailbox',
  };
}

/** The activity's phase, or null when there should be none (not yet, or long after landing). */
export function flightLaPhase(input: FlightLaInput, now: Date): LaFlightPhase | null {
  if (input.status === 'cancelled') return 'cancelled';
  const phase = laPhase(input, now);
  if (input.status === 'diverted') return phase === null ? null : 'diverted';
  return phase;
}

function colourOf(
  input: FlightLaInput,
  phase: LaFlightPhase,
  now: Date,
): 'default' | 'orange' | 'red' {
  if (phase === 'cancelled' || phase === 'diverted') return 'red';
  if (phase === 'boarding') return 'orange';
  const boarding = input.boardingAt?.getTime();
  if (
    phase === 'check_in' &&
    boarding !== undefined &&
    boarding - now.getTime() <= LA_FLIGHT_ORANGE_MS
  ) {
    return 'orange';
  }
  return 'default';
}

export function buildFlightLaState(
  input: FlightLaInput,
  phase: LaFlightPhase,
  now: Date,
  seq: number,
): FlightLaState {
  const arrives = input.actArrAt ?? input.estArrAt ?? input.schedArrAt;
  const onGround = phase === 'landed' || phase === 'pickup';
  return {
    seq,
    phase,
    sched: unixSeconds(input.schedDepAt),
    est: input.estDepAt === null ? null : unixSeconds(input.estDepAt),
    boarding_at: input.boardingAt === null ? null : unixSeconds(input.boardingAt),
    arr_at: arrives === null ? null : unixSeconds(arrives),
    gate: input.gate,
    terminal: input.terminal,
    seat: input.seat,
    delay_min: input.delayMin,
    colour: colourOf(input, phase, now),
    pickup:
      onGround && input.pickup !== null
        ? { name: laLine(input.pickup.name, 40), line: laLine(input.pickup.line, 80) }
        : null,
    grab_cta: onGround && input.pickup === null,
  };
}

/** When the activity should be gone: two hours after landing, or at once when cancelled. */
export function flightLaEndsAt(input: FlightLaInput): Date | null {
  const arrived = input.actArrAt ?? input.estArrAt ?? input.schedArrAt;
  return arrived === null ? null : new Date(arrived.getTime() + LA_PICKUP_MS);
}
