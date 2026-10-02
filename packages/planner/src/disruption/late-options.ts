/**
 * Running late (3k-9), worked out in code: what a late party can do about an item they will miss
 * the start of. The rows a chosen option becomes are in ./late-choice.ts.
 * - PUSH THE SLOT: the start moves by the lateness, rounded up to five minutes. When others are
 *   already there the group splits: they start as planned and the late ones slot in, so the plan
 *   stays as it is. Without them the item is retimed, if it still fits before the party's next.
 * - WALK THE LAST BIT: only when the walk measured from where they are beats the ride.
 * - SKIP IT: always there; money back per the booking's own numbers and the supplier's quote.
 * - CALL A CAR: only for a party with no ride (walking or on a scooter) going to a known place.
 * A booked item's time follows its booking, so the plan never moves it here: on its own party it
 * can only be pushed by asking whoever runs it. A flight is neither pushed nor skipped.
 * Recommendation: WALK when it helps, else PUSH, else a car, else SKIP.
 */
import type { JourneyMode, LateOption, LateOptionKind, LateSupplierEffect } from '@cp/domain';

import { localTime } from './flight-impact';

const MIN = 60_000;
const DEFAULT_LENGTH_MIN = 60;
/** A walk must beat the ride by at least this much to be worth offering. */
const WALK_SAVES_MIN = 2;

export interface LateBooking {
  readonly supplier: 'viator' | 'affiliate' | 'none';
  readonly partner: string | null;
  readonly priceMinor: number | null;
  readonly currency: string | null;
  /** The cancel quote's refund, when quoted. */
  readonly refundMinor: number | null;
  readonly cancellable: boolean | null;
}

export interface LateInput {
  readonly title: string;
  readonly tz: string;
  readonly now: Date;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly etaAt: Date;
  readonly lateMin: number;
  readonly mode: JourneyMode;
  /** Minutes on foot from where the party is now, when the router measured it. */
  readonly walkMin: number | null;
  readonly latePartyIds: readonly string[];
  /** The item's other attendees, on time and waiting. */
  readonly waitingIds: readonly string[];
  /** The late party's next item after this one. */
  readonly nextStartsAt: Date | null;
  /** Who runs the item (a driver, spa, restaurant the crew added), when someone does. */
  readonly vendorName: string | null;
  readonly booking: LateBooking;
  /** The item is a wallet booking on the plan: its time follows the booking, never the plan. */
  readonly anchored: boolean;
  /** The item is a flight leg: the time to be there is fixed and it cannot be sat out. */
  readonly flight: boolean;
  /** The item is at a known place a car can be called to. */
  readonly rideable: boolean;
}

function roundUp5(minutes: number): number {
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

function perPerson(amount: number | null, people: number): number | null {
  if (amount === null || people === 0) return null;
  return Math.round(amount / people);
}

export function lateOptions(input: LateInput): LateOption[] {
  const { booking } = input;
  const split = input.waitingIds.length > 0;
  const from = localTime(input.startsAt, input.tz);
  const pushMin = roundUp5(input.lateMin);
  const newStart = new Date(input.startsAt.getTime() + pushMin * MIN);
  const end = input.endsAt ?? new Date(input.startsAt.getTime() + DEFAULT_LENGTH_MIN * MIN);
  const newEnd = new Date(end.getTime() + pushMin * MIN);
  const to = localTime(newStart, input.tz);
  const fits = input.nextStartsAt === null || newEnd <= input.nextStartsAt;
  const base = {
    recommended: false,
    split,
    new_start: null,
    arrive_at: null,
    per_person_minor: 0,
    currency: booking.currency,
    supplier: 'none' as LateSupplierEffect,
    vendor_name: null,
  };

  const push: LateOption = {
    ...base,
    id: 'push',
    label: 'Push the slot',
    detail: split
      ? `The others start at ${from}. You slot in at ${to}.`
      : input.anchored && input.vendorName !== null
        ? `Ask ${input.vendorName} to start at ${to}.`
        : `${input.title} moves to ${to}.`,
    offered: !input.flight && (split || (fits && (!input.anchored || input.vendorName !== null))),
    new_start: newStart.toISOString(),
    arrive_at: input.etaAt.toISOString(),
    vendor_name: input.vendorName,
    facts: { title: input.title, from, to, minutes: pushMin },
  };

  const walkArrives =
    input.walkMin === null ? null : new Date(input.now.getTime() + input.walkMin * MIN);
  const walkSaves =
    walkArrives === null ? 0 : Math.round((input.etaAt.getTime() - walkArrives.getTime()) / MIN);
  const walk: LateOption = {
    ...base,
    id: 'walk',
    label: 'Walk the last bit',
    detail:
      walkArrives === null || input.walkMin === null
        ? ''
        : `${input.walkMin} min on foot from here. There about ${localTime(walkArrives, input.tz)}.`,
    offered: input.mode !== 'walk' && walkArrives !== null && walkSaves >= WALK_SAVES_MIN,
    arrive_at: walkArrives?.toISOString() ?? null,
    facts:
      input.walkMin === null || walkArrives === null
        ? { title: input.title }
        : {
            title: input.title,
            walk_min: input.walkMin,
            saves_min: walkSaves,
            arrive: localTime(walkArrives, input.tz),
          },
  };

  const refund = booking.cancellable === false ? 0 : booking.refundMinor;
  const lost =
    booking.priceMinor === null || refund === null
      ? null
      : Math.max(0, booking.priceMinor - refund);
  const people = Math.max(1, input.latePartyIds.length + input.waitingIds.length);
  const back = perPerson(refund, people);
  const skip: LateOption = {
    ...base,
    id: 'skip',
    label: 'Skip it',
    detail:
      booking.supplier === 'none'
        ? split
          ? 'The others go ahead without you.'
          : input.anchored
            ? 'The booking stays in the wallet until you cancel it.'
            : `${input.title} comes off the plan.`
        : booking.supplier === 'affiliate' && booking.partner !== null
          ? `Cancel it on ${booking.partner}.`
          : refund === null
            ? 'Refund depends on the booking policy.'
            : lost === 0
              ? 'Cancelled free.'
              : 'Part of it comes back.',
    offered: !input.flight,
    per_person_minor: booking.supplier === 'none' || back === 0 ? 0 : back === null ? null : -back,
    supplier:
      booking.supplier === 'viator'
        ? 'viator_cancel'
        : booking.supplier === 'affiliate'
          ? 'partner_link'
          : 'none',
    vendor_name: input.vendorName,
    facts: { title: input.title },
  };

  const car: LateOption = {
    ...base,
    id: 'car',
    label: 'Call a car',
    detail: 'Fare and pickup time from Grab.',
    offered: (input.mode === 'walk' || input.mode === 'scooter') && input.rideable,
    per_person_minor: null,
    facts: { title: input.title },
  };

  const recommended: LateOptionKind = walk.offered
    ? 'walk'
    : push.offered
      ? 'push'
      : car.offered
        ? 'car'
        : 'skip';
  return [push, walk, skip, car].map((option) => ({
    ...option,
    recommended: option.id === recommended,
  }));
}
