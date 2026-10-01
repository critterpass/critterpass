/**
 * An import candidate as a card (3h-2): what the confirmation said, whose email it came from,
 * who it is for and whether ADD also splits the price ("Split 6 ways": on when there is a price
 * and two or more travellers), and the resolve payload ADD / IGNORE sends.
 */
import {
  extractedBookingSchema,
  generateUuidV7,
  type ExtractedBooking,
  type ResolveImportCandidatePayload,
} from '@cp/domain';

import { KIND_LOOK } from '../data/model';
import { parseJson, type CandidateRow, type FxRow } from '../data/queries';
import type { WalletMember } from '../data/use-wallet-context';

export type CandidateState = 'parsing' | 'pending' | 'failed' | 'duplicate';

export interface CandidateView {
  readonly id: string;
  readonly state: CandidateState;
  readonly booking: ExtractedBooking | null;
  /** Whose inbox it came from, when it was not the member's own. */
  readonly fromMember: string | null;
  readonly mine: boolean;
  /** The member pasted or scanned it just now, so it was not found in anyone's inbox. */
  readonly broughtIn: boolean;
  readonly travellerIds: readonly string[];
  readonly canSplit: boolean;
  readonly failureReason: string | null;
  readonly needsConfirm: boolean;
  readonly createdAt: string;
}

const STATES: ReadonlySet<string> = new Set<CandidateState>([
  'parsing',
  'pending',
  'failed',
  'duplicate',
]);

function norm(name: string): string {
  return name.trim().split(/\s+/u)[0]?.toLocaleLowerCase() ?? '';
}

/**
 * Who a found booking is for: the crew members its traveller names match (by first name); when
 * it prints two or more travellers the names do not all match, the trip's travellers; one
 * traveller or none, the member alone.
 */
export function travellersFor(
  booking: ExtractedBooking | null,
  members: readonly WalletMember[],
  tripTravellers: readonly string[],
  uid: string,
): string[] {
  const printed = booking?.travellers ?? [];
  const matched = members
    .filter((member) => printed.some((name) => norm(name) === norm(member.name)))
    .map((member) => member.userId);
  if (printed.length >= 2) {
    if (matched.length === printed.length) return matched;
    return tripTravellers.length >= 2 ? [...tripTravellers] : matched.length > 0 ? matched : [uid];
  }
  return matched.length > 0 ? matched : [uid];
}

export function toCandidateView(
  row: CandidateRow,
  members: readonly WalletMember[],
  tripTravellers: readonly string[],
  uid: string,
): CandidateView | null {
  if (!STATES.has(row.status)) return null;
  const parsed = extractedBookingSchema.safeParse(parseJson<unknown>(row.extracted, null));
  const booking = parsed.success ? parsed.data : null;
  const travellerIds = travellersFor(booking, members, tripTravellers, uid);
  const mine = row.user_id === uid;
  return {
    id: row.id,
    state: row.status as CandidateState,
    booking,
    fromMember: mine
      ? null
      : (members.find((member) => member.userId === row.user_id)?.name ?? null),
    mine,
    broughtIn: mine && (row.source === 'paste' || row.source === 'scan'),
    travellerIds,
    canSplit: booking?.price != null && booking.price.amount_minor > 0 && travellerIds.length >= 2,
    failureReason: row.failure_reason,
    needsConfirm: row.needs_confirm === 1,
    createdAt: row.created_at,
  };
}

/** The doodle for a found booking's kind (the wallet's own). */
export function candidateIcon(booking: ExtractedBooking | null) {
  return KIND_LOOK[booking?.kind ?? 'other'].icon;
}

/** The FX snapshot a split in `currency` is stored against, when it is not the crew's. */
export function fxSnapshotFor(
  rows: readonly FxRow[],
  currency: string,
  crewCurrency: string,
): string | null {
  if (currency === crewCurrency) return null;
  return (
    (rows.find((row) => row.base === currency || row.quote === currency) ?? rows[0])?.id ?? null
  );
}

/** ADD: the booking in the trip for its travellers, and the split expense when asked for. */
export function addPayload(
  view: CandidateView,
  options: {
    readonly tripId: string;
    readonly split: boolean;
    readonly crewCurrency: string;
    readonly fx: readonly FxRow[];
    readonly newId?: () => string;
  },
): ResolveImportCandidatePayload {
  const price = view.booking?.price ?? null;
  const fx =
    price === null ? null : fxSnapshotFor(options.fx, price.currency, options.crewCurrency);
  const split =
    options.split &&
    view.canSplit &&
    price !== null &&
    (fx !== null || price.currency === options.crewCurrency)
      ? {
          split: {
            expense_id: (options.newId ?? generateUuidV7)(),
            ...(fx === null ? {} : { fx_snapshot_id: fx }),
            shares: view.travellerIds.map((userId) => ({ user_id: userId })),
          },
        }
      : {};
  return {
    candidate_id: view.id,
    action: 'add',
    trip_id: options.tripId,
    traveller_ids: [...view.travellerIds],
    ...split,
  };
}

export function ignorePayload(view: CandidateView): ResolveImportCandidatePayload {
  return { candidate_id: view.id, action: 'ignore' };
}
