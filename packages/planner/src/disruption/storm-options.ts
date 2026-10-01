/**
 * The storm decision's options (3k-8), worked out in code: SWAP the stormy day with the next calm
 * one, KEEP it, or SKIP the item. Every price comes from the booking's own numbers and the
 * supplier's cancel quote; per-person amounts split them over the item's attendees.
 * - A Viator booking can move only as a new booking the original booker pays for (Viator is the
 *   merchant; a crew vote cannot pay): SWAP says so, and its price is the new booking less the
 *   refund of the old one. Without seats on the new date, SWAP is not offered.
 * - An affiliate booking (Klook, GetYourGuide) is changed on the partner's site: SWAP links there.
 * - Without a calm day to swap with, SWAP is not offered.
 * Recommendation: SWAP when offered, else SKIP when the refund is full, else KEEP.
 */

export type StormOptionId = 'swap' | 'keep' | 'skip';
export type SupplierEffect = 'none' | 'viator_rebook' | 'partner_link' | 'viator_cancel';

export interface StormBooking {
  readonly supplier: 'viator' | 'affiliate' | 'none';
  /** Affiliate partner name, shown in "Change it on {partner}". */
  readonly partner: string | null;
  readonly priceMinor: number | null;
  readonly currency: string | null;
  /** The cancel quote's refund, when quoted. */
  readonly refundMinor: number | null;
  readonly cancellable: boolean | null;
  /** Seats on the swap date: from the supplier's availability, `unknown` when not asked. */
  readonly seatsOnSwapDay: 'available' | 'unavailable' | 'unknown';
  readonly bookerId: string | null;
}

export interface StormInput {
  readonly title: string;
  readonly day: string;
  readonly dayLabel: string;
  /** The calm day to swap with, when there is one. */
  readonly swapDay: { readonly day: string; readonly label: string } | null;
  readonly attendeeIds: readonly string[];
  readonly booking: StormBooking;
}

export interface StormOption {
  readonly id: StormOptionId;
  readonly label: string;
  readonly offered: boolean;
  readonly recommended: boolean;
  /** Each attendee's change in minor units (negative = money back); null when unknown. */
  readonly per_person_minor: number | null;
  readonly currency: string | null;
  readonly supplier: SupplierEffect;
  readonly facts: Readonly<Record<string, string | number>>;
  readonly note: string | null;
}

function perPerson(amount: number | null, people: number): number | null {
  if (amount === null || people === 0) return null;
  return Math.round(amount / people);
}

export function stormOptions(input: StormInput): StormOption[] {
  const { booking, swapDay } = input;
  const people = Math.max(1, input.attendeeIds.length);
  const refund = booking.cancellable === false ? 0 : booking.refundMinor;
  const lost =
    booking.priceMinor === null || refund === null
      ? null
      : Math.max(0, booking.priceMinor - refund);
  const seatsGone = booking.supplier === 'viator' && booking.seatsOnSwapDay === 'unavailable';
  const swapOffered = swapDay !== null && !seatsGone;
  const swapCost = booking.supplier === 'viator' ? lost : 0;
  const swap: StormOption = {
    id: 'swap',
    label: swapDay === null ? 'Swap days' : `Swap ${input.dayLabel} and ${swapDay.label}`,
    offered: swapOffered,
    recommended: false,
    per_person_minor: booking.supplier === 'none' ? 0 : perPerson(swapCost, people),
    currency: booking.currency,
    supplier:
      booking.supplier === 'viator'
        ? 'viator_rebook'
        : booking.supplier === 'affiliate'
          ? 'partner_link'
          : 'none',
    facts: { title: input.title, from: input.dayLabel, to: swapDay?.label ?? '' },
    note: seatsGone
      ? "Can't move the seats"
      : booking.supplier === 'viator'
        ? 'The booker confirms and pays the new booking; the old one is cancelled after'
        : booking.supplier === 'affiliate' && booking.partner !== null
          ? `Change it on ${booking.partner}`
          : null,
  };
  const keep: StormOption = {
    id: 'keep',
    label: `Keep ${input.dayLabel}`,
    offered: true,
    recommended: false,
    per_person_minor: 0,
    currency: booking.currency,
    supplier: 'none',
    facts: { title: input.title, day: input.dayLabel },
    note: null,
  };
  const back = perPerson(refund, people);
  const skip: StormOption = {
    id: 'skip',
    label: `Skip ${input.title}`,
    offered: true,
    recommended: false,
    per_person_minor: booking.supplier === 'none' ? 0 : back === null ? null : -back,
    currency: booking.currency,
    supplier:
      booking.supplier === 'viator'
        ? 'viator_cancel'
        : booking.supplier === 'affiliate'
          ? 'partner_link'
          : 'none',
    facts: { title: input.title },
    note:
      booking.supplier === 'none'
        ? null
        : refund === null
          ? 'Refund depends on the booking policy'
          : lost === 0
            ? 'Cancelled free'
            : null,
  };
  const recommended: StormOptionId = swapOffered
    ? 'swap'
    : booking.supplier === 'none' || lost === 0
      ? 'skip'
      : 'keep';
  return [swap, keep, skip].map((option) => ({
    ...option,
    recommended: option.id === recommended,
  }));
}
