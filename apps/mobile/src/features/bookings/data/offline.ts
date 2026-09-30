/**
 * The wallet in airplane mode. `GET /v1/trips/{id}/offline-bundle` answers signed document URLs
 * for every booking the member can see and the barcode of their own; each booking's documents are
 * saved under the app's `bookings/` folder and its barcode goes into the encrypted, local-only
 * `local_private` table (never synced, wiped on sign-out). "✓ n OFFLINE" counts the bookings
 * whose documents and barcode are all on the device at the booking's current version.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useMemo } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows } from './live-rows';
import type { WalletBooking } from './model';
import { parseJson, PRIVATE_BY_KIND_SQL, PRIVATE_TABLES, type AttachmentRow } from './queries';
import { useBookingsServices, type BookingsServices } from './services';

export const OFFLINE_KIND = 'booking_offline';

export interface OfflineBarcode {
  readonly format: string;
  readonly payload: string;
}

export interface OfflineEntry {
  readonly bookingId: string;
  readonly version: number;
  readonly barcode: OfflineBarcode | null;
  /** attachment id → local file URI. */
  readonly files: Readonly<Record<string, string>>;
}

interface BundleItem {
  readonly booking_id: string;
  readonly version: number;
  readonly attachments: readonly {
    readonly attachment_id: string;
    readonly kind: string;
    readonly url: string | null;
  }[];
  readonly barcode: OfflineBarcode | null;
}

export function offlineId(bookingId: string): string {
  return `${OFFLINE_KIND}:${bookingId}`;
}

function bundleItems(body: unknown): BundleItem[] {
  const items = (body as { sections?: { bookings?: { items?: unknown } } } | null)?.sections
    ?.bookings?.items;
  return Array.isArray(items) ? (items as BundleItem[]) : [];
}

/** File name of a cached document: its attachment id, which never repeats. */
function fileName(attachmentId: string): string {
  return attachmentId;
}

/** Pulls the trip's bundle and caches what it names; a no-op offline (the last copy stays). */
export async function refreshOfflineBundle(
  db: AbstractPowerSyncDatabase,
  services: BookingsServices,
  tripId: string,
): Promise<void> {
  const read = await services.getJson(`/v1/trips/${encodeURIComponent(tripId)}/offline-bundle`);
  if (read.kind !== 'ok') return;
  const items = bundleItems(read.value);
  const entries: OfflineEntry[] = [];
  for (const item of items) {
    const files: Record<string, string> = {};
    for (const attachment of item.attachments) {
      if (attachment.url === null) continue;
      const uri = await services.download(attachment.url, fileName(attachment.attachment_id));
      if (uri !== null) files[attachment.attachment_id] = uri;
    }
    entries.push({
      bookingId: item.booking_id,
      version: item.version,
      barcode: item.barcode,
      files,
    });
  }
  const at = new Date(services.now()).toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `DELETE FROM local_private WHERE kind = ? AND id IN (${entries.map(() => '?').join(',') || "''"})`,
      [OFFLINE_KIND, ...entries.map((entry) => offlineId(entry.bookingId))],
    );
    for (const entry of entries) {
      await tx.execute(
        'INSERT INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
        [offlineId(entry.bookingId), OFFLINE_KIND, JSON.stringify(entry), at],
      );
    }
  });
}

/** Bookings whose documents and barcode are all on the device at their current version. */
export function offlineBookingIds(
  bookings: readonly WalletBooking[],
  attachments: readonly AttachmentRow[],
  entries: ReadonlyMap<string, OfflineEntry>,
): Set<string> {
  const ready = new Set<string>();
  for (const booking of bookings) {
    const entry = entries.get(booking.id);
    if (entry === undefined || entry.version !== booking.version) continue;
    const docs = attachments.filter((attachment) => attachment.booking_id === booking.id);
    if (!docs.every((doc) => entry.files[doc.id] !== undefined)) continue;
    if (booking.mine && booking.hasBarcode && entry.barcode === null) continue;
    ready.add(booking.id);
  }
  return ready;
}

/** The cached entries by booking id, refreshed from the api whenever `refreshKey` changes. */
export function useOfflineEntries(
  tripId: string | null,
  refreshKey: string,
): ReadonlyMap<string, OfflineEntry> {
  const { db } = useLocalFirst();
  const services = useBookingsServices();
  const rows = useLiveRows<{ id: string; data: string }>(
    PRIVATE_BY_KIND_SQL,
    [OFFLINE_KIND],
    PRIVATE_TABLES,
  );
  useEffect(() => {
    if (tripId === null) return;
    refreshOfflineBundle(db, services, tripId).catch(() => undefined);
  }, [db, services, tripId, refreshKey]);
  return useMemo(() => {
    const map = new Map<string, OfflineEntry>();
    for (const row of rows.rows) {
      const entry = parseJson<OfflineEntry | null>(row.data, null);
      if (entry !== null) map.set(entry.bookingId, entry);
    }
    return map;
  }, [rows.rows]);
}
