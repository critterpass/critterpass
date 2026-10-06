/**
 * What the boost sheet shows and whether its button may buy, from the trip, who is seated, the
 * store's offers, another member's lock and the purchase in flight. Pure, so every state is
 * tested without a store. The split shown is a preview of the same rule the server applies to the
 * price the store actually charges: everyone owes the same floored share, the buyer absorbs the
 * remainder.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { splitBoost } from '@cp/cost-engine';
import { BOOST_WINDOW_DAYS_AFTER_TRIP, type ProductKey } from '@cp/domain';

import type { ProductOffer, ProductsState, PurchaseState } from '@/data/billing';

export type BoostOption = 'trip' | 'year';
export type WhoPays = 'cover' | 'split';

export type BoostPhase =
  | 'loading'
  | 'unavailable'
  | 'offline'
  | 'ready'
  | 'purchasing'
  | 'verifying'
  | 'pending'
  | 'background'
  | 'failed'
  | 'verify_failed'
  /** The boost is confirmed by the server. */
  | 'done'
  /** The trip already has a boost (bought, first trip free or the crew's yearly). */
  | 'boosted'
  /** The trip is over: there is nothing left to boost. */
  | 'ended'
  /** Another member is paying for it right now. */
  | 'locked'
  /** The server would not start the purchase; nothing was charged. */
  | 'refused';

export interface BoostTrip {
  readonly status: string;
  readonly boostActive: boolean;
  /** `YYYY-MM-DD`, or null while the dates are not set. */
  readonly endDate: string | null;
  readonly solo: boolean;
}

export interface SeatedMember {
  readonly uid: string;
  readonly name: string;
}

export interface BoostLock {
  readonly buyerUid: string;
  readonly name: string;
  readonly expiresAt: string;
}

export interface BoostInput {
  readonly products: ProductsState;
  readonly purchase: PurchaseState;
  readonly online: boolean;
  readonly option: BoostOption;
  readonly whoPays: WhoPays;
  /** Null until the trip has been read. */
  readonly trip: BoostTrip | null;
  readonly seated: readonly SeatedMember[];
  readonly buyerUid: string | null;
  readonly lock: BoostLock | null;
  /** What the server said when the purchase was started, if it refused. */
  readonly intentError: 'locked' | 'refused' | null;
  readonly now: Date;
  readonly locale: string;
}

export interface BoostModel {
  readonly phase: BoostPhase;
  readonly option: BoostOption;
  readonly productKey: ProductKey;
  readonly offer: ProductOffer | null;
  readonly tripOffer: ProductOffer | null;
  readonly yearOffer: ProductOffer | null;
  /** Splitting needs someone else seated; a solo trip is covered by its one member. */
  readonly canSplit: boolean;
  readonly whoPays: WhoPays;
  /** The members a split goes over, the buyer included; empty when covering. */
  readonly memberUids: readonly string[];
  /** Each other member's share of the store's price, formatted; null when covering. */
  readonly eachShare: string | null;
  /** The last day the boost is on (`YYYY-MM-DD`): a week after the trip ends. */
  readonly windowEnd: string | null;
  /** Who holds the lock, when someone else does. */
  readonly lockedBy: string | null;
  readonly canBuy: boolean;
}

const ENDED = ['post_trip', 'archived', 'cancelled'];
const DAY_MS = 86_400_000;

export function boostWindowEnd(endDate: string | null): string | null {
  if (endDate === null) return null;
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  return new Date(end.getTime() + BOOST_WINDOW_DAYS_AFTER_TRIP * DAY_MS).toISOString().slice(0, 10);
}

function minorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** One member's share of `offer` split over `memberUids`, as the buyer's crewmates will owe it. */
export function sharePreview(
  offer: ProductOffer,
  buyerUid: string,
  memberUids: readonly string[],
  locale: string,
): string | null {
  if (memberUids.length < 2 || !memberUids.includes(buyerUid)) return null;
  const digits = minorDigits(offer.currencyCode);
  const scale = 10 ** digits;
  const total = {
    amountMinor: BigInt(Math.round(offer.price * scale)),
    currency: offer.currencyCode,
  };
  const share = splitBoost(total, buyerUid, memberUids).ious[0];
  if (share === undefined) return null;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: offer.currencyCode }).format(
    Number(share.amount.amountMinor) / scale,
  );
}

const BUSY: Partial<Record<PurchaseState['status'], BoostPhase>> = {
  purchasing: 'purchasing',
  verifying: 'verifying',
  pending: 'pending',
  background: 'background',
  done: 'done',
};

export function boostModel(input: BoostInput): BoostModel {
  const offers = input.products.status === 'ready' ? input.products.offers : {};
  const tripOffer = offers.boost_trip ?? null;
  // The yearly boost belongs to a crew: a trip for one has none to bind it to.
  const yearOffer = input.trip?.solo === true ? null : (offers.boost_crew_year ?? null);
  const option: BoostOption = input.option === 'year' && yearOffer !== null ? 'year' : 'trip';
  const offer = option === 'year' ? yearOffer : tripOffer;
  const buyer = input.buyerUid;
  const others = input.seated.filter((member) => member.uid !== buyer);
  const canSplit = buyer !== null && others.length > 0;
  const whoPays: WhoPays = canSplit && input.whoPays === 'split' ? 'split' : 'cover';
  const memberUids =
    whoPays === 'split' && buyer !== null ? [buyer, ...others.map((member) => member.uid)] : [];
  const lockLive =
    input.lock !== null &&
    input.lock.buyerUid !== buyer &&
    new Date(input.lock.expiresAt).getTime() > input.now.getTime();
  const phase = phaseOf(input, offer, lockLive);
  return {
    phase,
    option,
    productKey: option === 'year' ? 'boost_crew_year' : 'boost_trip',
    offer,
    tripOffer,
    yearOffer,
    canSplit,
    whoPays,
    memberUids,
    eachShare:
      offer !== null && buyer !== null && whoPays === 'split'
        ? sharePreview(offer, buyer, memberUids, input.locale)
        : null,
    windowEnd: boostWindowEnd(input.trip?.endDate ?? null),
    lockedBy: lockLive ? (input.lock?.name ?? '') : null,
    canBuy: (phase === 'ready' || phase === 'failed' || phase === 'refused') && buyer !== null,
  };
}

function phaseOf(input: BoostInput, offer: ProductOffer | null, lockLive: boolean): BoostPhase {
  const { purchase, trip } = input;
  const busy = BUSY[purchase.status];
  if (busy !== undefined) return busy;
  if (purchase.status === 'failed' && purchase.stage === 'verify') return 'verify_failed';
  if (trip === null) return 'loading';
  if (trip.boostActive) return 'boosted';
  const windowEnd = boostWindowEnd(trip.endDate);
  if (
    ENDED.includes(trip.status) ||
    (windowEnd !== null && windowEnd <= input.now.toISOString().slice(0, 10))
  ) {
    return 'ended';
  }
  if (lockLive || input.intentError === 'locked') return 'locked';
  if (input.products.status === 'loading') return 'loading';
  if (offer === null) return 'unavailable';
  if (!input.online) return 'offline';
  if (purchase.status === 'failed') return 'failed';
  if (input.intentError === 'refused') return 'refused';
  return 'ready';
}
