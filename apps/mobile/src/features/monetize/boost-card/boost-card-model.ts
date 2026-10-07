/**
 * What the crew's boost card (4c-1) says to the person looking at it, from the synced rows alone:
 * the boost, the split's shares and the crew's payments to the buyer. Nothing is decided here that
 * the server did not write: a share counts as settled once its member has a payment to the buyer,
 * marked paid or confirmed, made after the boost.
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
  readonly createdAt: string;
}

/** One `expense_shares` row of the boost's expense. */
export interface CardShare {
  readonly userId: string;
  readonly name: string;
  readonly minor: number;
  readonly currency: string;
}

export interface CardPayment {
  readonly fromId: string;
  readonly toId: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface CardInput {
  readonly viewerUid: string | null;
  readonly boost: CardBoost | null;
  readonly shares: readonly CardShare[];
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

// eslint-disable-next-line lingui/no-unlocalized-strings -- payment states, never copy.
const PAID: readonly string[] = ['marked_paid', 'confirmed'];

/** Synced timestamps come as ISO text, sometimes with a space for the `T`. */
function time(value: string): number {
  return Date.parse(value.replace(' ', 'T'));
}

export function boostCardModel(input: CardInput): BoostCardModel {
  const { boost, viewerUid } = input;
  if (boost === null) return { kind: 'loading' };
  if (boost.status === 'revoked') return { kind: 'gone', reason: 'revoked' };
  if (boost.status === 'moved' || boost.status === 'credit') {
    return { kind: 'gone', reason: 'moved' };
  }
  const buyer = boost.buyerId;
  const since = time(boost.createdAt);
  const paid = new Set(
    input.payments
      .filter(
        (payment) =>
          payment.toId === buyer &&
          PAID.includes(payment.status) &&
          !(time(payment.createdAt) < since),
      )
      .map((payment) => payment.fromId),
  );
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
    ways: !boost.split
      ? 0
      : splitPending
        ? boost.splitMemberIds.length
        : input.shares.length,
    splitPending,
    viewer,
    share: viewer === 'owes' && own !== undefined ? { minor: own.minor, currency: own.currency } : null,
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
