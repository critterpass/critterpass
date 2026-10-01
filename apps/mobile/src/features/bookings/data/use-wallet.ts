/**
 * `useWallet(tripId, uid)`: the trip's bookings as wallet cards with their flight legs, split into
 * the stack and the archive (less the ones whose delete is still on its way to the server), plus
 * which of them are ready offline and their cached barcodes and
 * documents. Everything is read from local rows, so it renders in airplane mode.
 */
import { useMemo } from 'react';

import { useLiveRows } from './live-rows';
import {
  splitWallet,
  toWalletBooking,
  withoutDeleted,
  type WalletBooking,
  type WalletSplit,
} from './model';
import { offlineBookingIds, useOfflineEntries, type OfflineEntry } from './offline';
import {
  ATTACHMENTS_SQL,
  ATTACHMENTS_TABLES,
  BOOKINGS_SQL,
  BOOKINGS_TABLES,
  PENDING_DELETES_SQL,
  PENDING_DELETES_TABLES,
  SEGMENTS_SQL,
  SEGMENTS_TABLES,
  type AttachmentRow,
  type BookingRow,
  type SegmentRow,
} from './queries';
import { useBookingsServices } from './services';

export interface Wallet extends WalletSplit {
  readonly loaded: boolean;
  readonly all: readonly WalletBooking[];
  /** Every crew-visible flight leg of the trip (for co-travellers). */
  readonly segments: readonly SegmentRow[];
  readonly attachments: readonly AttachmentRow[];
  readonly offline: ReadonlySet<string>;
  readonly entries: ReadonlyMap<string, OfflineEntry>;
}

export function useWallet(tripId: string | null, uid: string | null): Wallet {
  const services = useBookingsServices();
  const params = tripId === null ? null : [tripId];
  const synced = useLiveRows<BookingRow>(BOOKINGS_SQL, params, BOOKINGS_TABLES);
  const deleting = useLiveRows<{ booking_id: string | null }>(
    PENDING_DELETES_SQL,
    [],
    PENDING_DELETES_TABLES,
  );
  const bookings = useMemo(
    () => ({ loaded: synced.loaded, rows: withoutDeleted(synced.rows, deleting.rows) }),
    [synced.loaded, synced.rows, deleting.rows],
  );
  const segments = useLiveRows<SegmentRow>(SEGMENTS_SQL, params, SEGMENTS_TABLES);
  const attachments = useLiveRows<AttachmentRow>(ATTACHMENTS_SQL, params, ATTACHMENTS_TABLES);
  const versions = bookings.rows.map((row) => `${row.id}:${String(row.version)}`).join(',');
  const entries = useOfflineEntries(tripId, versions);
  return useMemo(() => {
    const all = bookings.rows.map((row) => toWalletBooking(row, segments.rows, uid));
    return {
      loaded: bookings.loaded && segments.loaded,
      all,
      ...splitWallet(all, services.now()),
      segments: segments.rows,
      attachments: attachments.rows,
      offline: offlineBookingIds(all, attachments.rows, entries),
      entries,
    };
  }, [
    bookings.rows,
    bookings.loaded,
    segments.rows,
    segments.loaded,
    attachments.rows,
    entries,
    uid,
    services,
  ]);
}
