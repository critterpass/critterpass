/**
 * The wallet's view of a trip's bookings: each synced row as a typed card (colour and doodle per
 * kind), split into what is still ahead and the archive of what has ended, with the soonest
 * relevant booking open at the front of the stack.
 */
import type { BookingDetails, BookingKind } from '@cp/domain';

import type { CardTone } from '@/ui/cards/tone';
import type { DoodleName } from '@/ui/icons/generated';

import { parseJson, type BookingRow, type SegmentRow } from './queries';

export interface WalletBooking {
  readonly id: string;
  readonly kind: BookingKind;
  readonly title: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly tz: string | null;
  readonly location: string | null;
  readonly tone: CardTone;
  readonly icon: DoodleName;
  readonly ownerId: string;
  readonly mine: boolean;
  readonly visibility: 'crew' | 'personal';
  readonly flightCrewVisible: boolean;
  readonly travellerIds: readonly string[];
  readonly priceMinor: number | null;
  readonly currency: string | null;
  readonly paidBy: string | null;
  readonly supplierRef: string | null;
  readonly freeCancelUntil: string | null;
  readonly cancelPolicyText: string | null;
  readonly status: string;
  readonly source: string;
  readonly details: BookingDetails;
  readonly hasBarcode: boolean;
  readonly version: number;
  /** Flight legs in order; empty for every other kind. */
  readonly segments: readonly SegmentRow[];
}

const KINDS: ReadonlySet<string> = new Set<BookingKind>([
  'flight',
  'stay',
  'activity',
  'boat',
  'transfer',
  'rail',
  'car',
  'other',
]);

export const KIND_LOOK: Readonly<Record<BookingKind, { tone: CardTone; icon: DoodleName }>> = {
  activity: { tone: 'yellow', icon: 'volcano' },
  boat: { tone: 'green', icon: 'boat' },
  stay: { tone: 'pink', icon: 'bed' },
  flight: { tone: 'blue', icon: 'plane' },
  transfer: { tone: 'orange', icon: 'car' },
  car: { tone: 'orange', icon: 'car' },
  rail: { tone: 'cream', icon: 'ticket' },
  other: { tone: 'paper', icon: 'ticket' },
};

export function kindOf(type: string): BookingKind {
  return KINDS.has(type) ? (type as BookingKind) : 'other';
}

/** `uuid[]` arrives as JSON text or a Postgres array literal, depending on the sync path. */
export function parseIdList(text: string | null): string[] {
  if (text === null || text === '') return [];
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) return parseJson<unknown[]>(trimmed, []).map(String);
  if (trimmed.startsWith('{')) {
    const inner = trimmed.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((id) => id.replace(/"/gu, '').trim());
  }
  return [];
}

export function toWalletBooking(
  row: BookingRow,
  segments: readonly SegmentRow[],
  uid: string | null,
): WalletBooking {
  const kind = kindOf(row.type);
  const look = KIND_LOOK[kind];
  return {
    id: row.id,
    kind,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    tz: row.tz,
    location: row.location,
    tone: look.tone,
    icon: look.icon,
    ownerId: row.owner_id,
    mine: row.owner_id === uid,
    visibility: row.visibility === 'crew' ? 'crew' : 'personal',
    flightCrewVisible: row.flight_crew_visible !== 0,
    travellerIds: parseIdList(row.traveller_ids),
    priceMinor: row.price_minor,
    currency: row.currency,
    paidBy: row.paid_by,
    supplierRef: row.supplier_ref,
    freeCancelUntil: row.free_cancel_until,
    cancelPolicyText: row.cancel_policy_text,
    status: row.status,
    source: row.source,
    details: parseJson<BookingDetails>(row.details, {}),
    hasBarcode: row.barcode_format !== null,
    version: row.version,
    segments: kind === 'flight' ? segments.filter((segment) => segment.booking_id === row.id) : [],
  };
}

/**
 * The synced rows without the bookings the traveller has already deleted on this phone: a queued
 * delete takes its card out of the wallet at once, so it cannot be opened and deleted again.
 */
export function withoutDeleted<Row extends { readonly id: string }>(
  rows: readonly Row[],
  deleting: readonly { readonly booking_id: string | null }[],
): readonly Row[] {
  if (deleting.length === 0) return rows;
  const gone = new Set(deleting.map((row) => row.booking_id));
  return rows.filter((row) => !gone.has(row.id));
}

/** When a booking stops being relevant: its end, its last leg's arrival, else its start. */
export function endsOf(booking: WalletBooking): number | null {
  const lastLeg = booking.segments[booking.segments.length - 1];
  const at =
    booking.endsAt ??
    lastLeg?.act_arr_at ??
    lastLeg?.est_arr_at ??
    lastLeg?.sched_arr_at ??
    lastLeg?.sched_dep_at ??
    booking.startsAt;
  if (at === null) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

export function startOf(booking: WalletBooking): number {
  const at = booking.segments[0]?.sched_dep_at ?? booking.startsAt;
  const ms = at === null ? Number.NaN : Date.parse(at);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** A booking stays in the stack until six hours after it ends (a late landing, a checkout). */
export const ARCHIVE_GRACE_MS = 6 * 3_600_000;

export interface WalletSplit {
  readonly upcoming: readonly WalletBooking[];
  /** Ended bookings, most recent first. */
  readonly past: readonly WalletBooking[];
}

export function splitWallet(bookings: readonly WalletBooking[], now: number): WalletSplit {
  const upcoming: WalletBooking[] = [];
  const past: WalletBooking[] = [];
  for (const booking of bookings) {
    const end = endsOf(booking);
    if (booking.status === 'cancelled' || (end !== null && end + ARCHIVE_GRACE_MS < now)) {
      past.push(booking);
    } else {
      upcoming.push(booking);
    }
  }
  upcoming.sort((a, b) => startOf(a) - startOf(b) || a.id.localeCompare(b.id));
  past.sort((a, b) => (endsOf(b) ?? 0) - (endsOf(a) ?? 0) || a.id.localeCompare(b.id));
  return { upcoming, past };
}

/** The soonest relevant booking: the one under way, else the next to start. */
export function soonestRelevant(upcoming: readonly WalletBooking[], now: number): string | null {
  const underWay = upcoming.find(
    (booking) => startOf(booking) <= now && (endsOf(booking) ?? Number.POSITIVE_INFINITY) >= now,
  );
  return (underWay ?? upcoming[0])?.id ?? null;
}

/** The closed cards in stack order (soonest first) and the open one, which sits at the front. */
export function stackOrder(
  upcoming: readonly WalletBooking[],
  selectedId: string | null,
): { closed: readonly WalletBooking[]; open: WalletBooking | null } {
  const open = upcoming.find((booking) => booking.id === selectedId) ?? upcoming[0] ?? null;
  return { closed: upcoming.filter((booking) => booking !== open), open };
}

/** Whole nights between check-in and check-out, in the stay's own calendar. */
export function nightsOf(booking: Pick<WalletBooking, 'startsAt' | 'endsAt'>): number | null {
  if (booking.startsAt === null || booking.endsAt === null) return null;
  const start = Date.parse(booking.startsAt.slice(0, 10));
  const end = Date.parse(booking.endsAt.slice(0, 10));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 86_400_000);
}
