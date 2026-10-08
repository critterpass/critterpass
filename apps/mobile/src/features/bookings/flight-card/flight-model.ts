/**
 * A flight card's state from its legs: the chip (ON TIME, DELAYED 25M, GATE CHANGE, BOARDING,
 * CANCELLED, LANDED…), the departure and arrival shown (the latest estimate or actual time the
 * provider gave, else the schedule), the boarding time (labelled "est." when it is the dep − 40
 * min estimate), gate, seat and bag, where the status came from, and the crewmates on board.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import { coTravellers, DELAY_REPORT_MIN } from '@cp/domain';

import type { WalletBooking } from '../data/model';
import type { SegmentRow } from '../data/queries';

export type FlightChip =
  | 'scheduled'
  | 'on_time'
  | 'delayed'
  | 'gate_change'
  | 'boarding'
  | 'departed'
  | 'landed'
  | 'cancelled'
  | 'diverted';

export interface FlightView {
  readonly bookingId: string;
  /** "SQ 938". */
  readonly number: string;
  readonly from: string;
  readonly to: string;
  readonly departsAt: string;
  readonly arrivesAt: string | null;
  /** The printed departure, when the time shown has moved off it (struck beside the new one). */
  readonly wasDepartingAt: string | null;
  readonly chip: FlightChip;
  readonly delayMin: number;
  readonly boardsAt: string | null;
  readonly boardingEstimated: boolean;
  readonly gate: string | null;
  readonly terminal: string | null;
  readonly seat: string | null;
  readonly bag: string | null;
  /** "AeroAPI · 09:12" once a provider or the traveller said something. */
  readonly source: { readonly name: string; readonly at: string } | null;
  readonly coTravellerIds: readonly string[];
  readonly legs: number;
}

const SOURCE_NAMES: Readonly<Record<string, string>> = {
  flightaware: 'AeroAPI',
  aerodatabox: 'AeroDataBox',
};

/** The leg the card is about: the first that has not landed, else the last. */
export function currentLeg(segments: readonly SegmentRow[]): SegmentRow | null {
  return (
    segments.find((leg) => leg.status !== 'landed' && leg.status !== 'cancelled') ??
    segments[segments.length - 1] ??
    null
  );
}

export function chipOf(leg: SegmentRow, gateChanged: boolean): FlightChip {
  switch (leg.status) {
    case 'cancelled':
    case 'diverted':
    case 'landed':
    case 'departed':
    case 'boarding':
      return leg.status;
    default:
      break;
  }
  if (leg.status === 'delayed' || (leg.delay_min ?? 0) >= DELAY_REPORT_MIN) return 'delayed';
  if (gateChanged) return 'gate_change';
  return leg.status === 'on_time' ? 'on_time' : 'scheduled';
}

export function flightView(
  booking: WalletBooking,
  crewSegments: readonly SegmentRow[],
  options: { readonly gateChanged?: boolean } = {},
): FlightView | null {
  const leg = currentLeg(booking.segments);
  if (leg === null) return null;
  const last = booking.segments[booking.segments.length - 1] ?? leg;
  const crew = crewSegments.map((segment) => ({
    ownerId: segment.owner_id,
    carrier: segment.carrier,
    flightNo: segment.flight_no,
    schedDepAt: segment.sched_dep_at,
  }));
  const name =
    leg.status_source === 'manual' || leg.status_source === 'schedule' || leg.status_source === null
      ? null
      : (SOURCE_NAMES[leg.status_source] ?? null);
  const departsAt = leg.act_dep_at ?? leg.est_dep_at ?? leg.sched_dep_at;
  return {
    bookingId: booking.id,
    number: `${leg.carrier} ${leg.flight_no}`,
    from: leg.dep_airport,
    to: last.arr_airport,
    departsAt,
    wasDepartingAt:
      Date.parse(departsAt) === Date.parse(leg.sched_dep_at) ? null : leg.sched_dep_at,
    arrivesAt: last.act_arr_at ?? last.est_arr_at ?? last.sched_arr_at,
    chip: chipOf(leg, options.gateChanged === true),
    delayMin: leg.delay_min ?? 0,
    boardsAt: leg.boarding_at,
    boardingEstimated: leg.boarding_estimated === 1,
    gate: leg.gate,
    terminal: leg.terminal,
    seat: booking.details.seat ?? null,
    bag: booking.details.baggage ?? null,
    source: name === null || leg.status_at === null ? null : { name, at: leg.status_at },
    coTravellerIds: coTravellers(
      {
        ownerId: booking.ownerId,
        carrier: leg.carrier,
        flightNo: leg.flight_no,
        schedDepAt: leg.sched_dep_at,
      },
      crew,
    ),
    legs: booking.segments.length,
  };
}

/** Statuses the traveller must not miss: drawn as a filled tag, not the quiet label. */
export function needsAttention(chip: FlightChip): boolean {
  return (
    chip === 'cancelled' || chip === 'diverted' || chip === 'delayed' || chip === 'gate_change'
  );
}

/** "I landed" is offered once the flight should have left, until it has landed or was cancelled. */
export function canReportLanded(view: FlightView, now: number): boolean {
  if (view.chip === 'landed' || view.chip === 'cancelled') return false;
  return Date.parse(view.departsAt) <= now;
}
