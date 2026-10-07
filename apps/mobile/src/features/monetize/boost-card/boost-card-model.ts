/**
 * What the crew's boost card (4c-1) says to the person looking at it, from the synced rows alone:
 * the boost, the split's shares and the trip's money. Nothing is decided here that the server did
 * not write.
 *
 * The app nets balances: a trip has one ledger of moves between members, a payment is not tied to
 * the expense it repays, and settling up pays down a member's whole net (to whoever the plan
 * names, not always the buyer). So a share of the boost is settled exactly when its IOU is in the
 * ledger and its member owes nothing on the trip any more, counting payments they have marked
 * paid the way settling up does. Paying part of what they owe, or paying for something else while
 * still owing, leaves the share open.
 */
export interface CardBoost {
  readonly id: string;
  readonly buyerId: string | null;
  /** `trip_boosts.status`. */
  readonly status: string;
  readonly split: boolean;
  /** Who the buyer picked for the split (the buyer included), as the intent recorded it. */
  readonly splitMemberIds: readonly string[];
  readonly thankedBy: readonly string[];
}

/** One `expense_shares` row of the boost's expense. */
export interface CardShare {
  readonly userId: string;
  readonly name: string;
  readonly minor: number;
  readonly currency: string;
}

/** One `ledger_entries` row of the trip: `debtorId` owes `creditorId` the amount. */
export interface CardLedgerEntry {
  readonly debtorId: string;
  readonly creditorId: string;
  readonly minor: number;
  readonly currency: string;
  readonly sourceKind: string;
  readonly sourceId: string;
}

/** One `payments` row of the trip. */
export interface CardPayment {
  readonly fromId: string;
  readonly toId: string;
  readonly minor: number;
  readonly currency: string;
  readonly status: string;
}

export interface CardInput {
  readonly viewerUid: string | null;
  readonly boost: CardBoost | null;
  /** The split's expense and the currency its IOUs are kept in; null until it is written. */
  readonly expense: { readonly id: string; readonly ledgerCurrency: string } | null;
  readonly shares: readonly CardShare[];
  readonly ledger: readonly CardLedgerEntry[];
  readonly payments: readonly CardPayment[];
}

export interface CardMember {
  readonly uid: string;
  readonly name: string;
}

export type BoostCardModel =
  | { readonly kind: 'loading' }
  /** The boost was refunded or moved to another trip: the card greys and says so. */
  | { readonly kind: 'gone'; readonly reason: 'revoked' | 'moved' }
  | {
      readonly kind: 'live';
      readonly split: boolean;
      /** How many ways the cost is split (the buyer included); 0 when covered. */
      readonly ways: number;
      /** The split was chosen but its shares are not written yet. */
      readonly splitPending: boolean;
      /** `free`: owes nothing (covered, or joined after the boost). */
      readonly viewer: 'buyer' | 'owes' | 'settled' | 'free';
      /** The viewer's own share, when they owe one. */
      readonly share: { readonly minor: number; readonly currency: string } | null;
      readonly thanks: 'offer' | 'sent' | 'none';
      readonly settled: readonly CardMember[];
      /** Members whose share is still open. */
      readonly remaining: number;
      /** Every share is settled ("Everyone's square"). */
      readonly allSquare: boolean;
    };

/* eslint-disable lingui/no-unlocalized-strings -- ledger and payment wire values, never copy. */
const BOOST_IOU = 'boost_iou';
const MARKED_PAID = 'marked_paid';
/* eslint-enable lingui/no-unlocalized-strings */

/**
 * The members whose share of the split is settled: their IOU to the buyer is in the ledger and
 * their net on the trip (what they are owed minus what they owe, a marked-paid payment counted as
 * made, as settling up counts it) is not below zero. A confirmed payment is already a ledger move.
 */
function settledMembers(input: CardInput, buyer: string | null): ReadonlySet<string> {
  const { expense } = input;
  const settled = new Set<string>();
  if (expense === null || buyer === null) return settled;
  const currency = expense.ledgerCurrency;
  const net = new Map<string, number>();
  const move = (uid: string, minor: number) => net.set(uid, (net.get(uid) ?? 0) + minor);
  const owes = new Set<string>();
  for (const entry of input.ledger) {
    if (entry.currency !== currency) continue;
    move(entry.creditorId, entry.minor);
    move(entry.debtorId, -entry.minor);
    if (
      entry.sourceKind === BOOST_IOU &&
      entry.sourceId === expense.id &&
      entry.creditorId === buyer
    ) {
      owes.add(entry.debtorId);
    }
  }
  for (const payment of input.payments) {
    if (payment.status !== MARKED_PAID || payment.currency !== currency) continue;
    move(payment.fromId, payment.minor);
    move(payment.toId, -payment.minor);
  }
  for (const uid of owes) if ((net.get(uid) ?? 0) >= 0) settled.add(uid);
  return settled;
}

export function boostCardModel(input: CardInput): BoostCardModel {
  const { boost, viewerUid } = input;
  if (boost === null) return { kind: 'loading' };
  if (boost.status === 'revoked') return { kind: 'gone', reason: 'revoked' };
  if (boost.status === 'moved' || boost.status === 'credit') {
    return { kind: 'gone', reason: 'moved' };
  }
  const buyer = boost.buyerId;
  const paid = settledMembers(input, buyer);
  const debtors = boost.split
    ? input.shares.filter((share) => share.userId !== buyer && share.minor > 0)
    : [];
  const settled = debtors
    .filter((share) => paid.has(share.userId))
    .map((share) => ({ uid: share.userId, name: share.name }));
  const own = debtors.find((share) => share.userId === viewerUid);
  const viewer =
    viewerUid !== null && viewerUid === buyer
      ? 'buyer'
      : own === undefined
        ? 'free'
        : paid.has(own.userId)
          ? 'settled'
          : 'owes';
  const thanks =
    viewerUid === null || buyer === null || viewer === 'buyer'
      ? 'none'
      : boost.thankedBy.includes(viewerUid)
        ? 'sent'
        : 'offer';
  const splitPending = boost.split && input.shares.length === 0;
  return {
    kind: 'live',
    split: boost.split,
    ways: !boost.split ? 0 : splitPending ? boost.splitMemberIds.length : input.shares.length,
    splitPending,
    viewer,
    share:
      viewer === 'owes' && own !== undefined ? { minor: own.minor, currency: own.currency } : null,
    thanks,
    settled,
    remaining: debtors.length - settled.length,
    allSquare: debtors.length > 0 && settled.length === debtors.length,
  };
}

/** "$2" for a whole amount, "$1.71" otherwise, in the share's own currency. */
export function shareText(
  share: { readonly minor: number; readonly currency: string },
  locale: string,
): string {
  let digits: number;
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency: share.currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    return `${share.minor / 100} ${share.currency}`;
  }
  const scale = 10 ** digits;
  const whole = share.minor % scale === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: share.currency,
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(share.minor / scale);
}
