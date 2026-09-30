/**
 * Commission-neutral ranking (docs/product-decisions.md §5): what the guide recommends is ranked
 * from place, taste and cost signals before any partner is attached, and the partner for a pick
 * is chosen by availability, then price, then a fixed order. Commission rates are carried on the
 * options for reporting only; nothing here reads them, and the ranking-guard test permutes them
 * to prove it.
 */
import type { AffiliatePartner } from './partners';

export interface RankedCandidate {
  readonly id: string;
  /** Place, taste and cost signals only, higher is better. */
  readonly score: number;
}

export interface PartnerOption {
  readonly partner: AffiliatePartner;
  readonly available: boolean;
  /** The price the traveller would pay, in the trip currency's minor units; null = unknown. */
  readonly priceMinor: number | null;
  /** Reporting only: never an input to ranking or choice. */
  readonly commissionRate?: number;
}

/** Tie-break order between partners offering the same thing at the same price. */
export const PARTNER_FIXED_ORDER: readonly AffiliatePartner[] = [
  'viator',
  'klook',
  'gyg',
  'agoda',
  'trip_com',
  'booking_cj',
  'kiwitaxi',
  'gettransfer',
  'grab',
  'travelpayouts',
];

function fixedIndex(partner: AffiliatePartner): number {
  const index = PARTNER_FIXED_ORDER.indexOf(partner);
  return index === -1 ? PARTNER_FIXED_ORDER.length : index;
}

/** Best first; equal scores keep a stable order by id. */
export function rankCandidates<C extends RankedCandidate>(candidates: readonly C[]): C[] {
  return [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** The partner to link a pick to: available first, then cheapest known price, then fixed order. */
export function choosePartner<O extends PartnerOption>(options: readonly O[]): O | null {
  const available = options.filter((option) => option.available);
  const [best] = [...available].sort((a, b) => {
    const pa = a.priceMinor ?? Number.POSITIVE_INFINITY;
    const pb = b.priceMinor ?? Number.POSITIVE_INFINITY;
    return pa - pb || fixedIndex(a.partner) - fixedIndex(b.partner);
  });
  return best ?? null;
}
