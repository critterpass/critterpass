/**
 * Scans taken offline ("Saved. Tokek reads it when you're back online"): the device's read and the
 * photo's path wait in `local_state` (on this device only) and upload once the phone is online,
 * from whichever money screen is open. A scan whose photo is gone uploads its lines alone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys and wire values, never copy. */
import type { PostReceiptBody } from '@cp/domain';
import { useEffect } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { json } from '../data/queries';
import type { MoneyServices } from '../data/services';

export const RECEIPT_QUEUE_KEY = 'money.receipt_queue';

export interface QueuedScan {
  readonly uri: string;
  readonly body: Omit<PostReceiptBody, 'media_key'>;
}

interface Store {
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

async function read(db: Store): Promise<QueuedScan[]> {
  const row = await db.getOptional<{ value: string | null }>(
    'SELECT value FROM local_state WHERE id = ?',
    [RECEIPT_QUEUE_KEY],
  );
  return json<QueuedScan[]>(row?.value, []);
}

async function write(db: Store, scans: readonly QueuedScan[]): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    RECEIPT_QUEUE_KEY,
    JSON.stringify(scans),
  ]);
}

export async function queueScan(db: Store, scan: QueuedScan): Promise<void> {
  const scans = await read(db);
  await write(db, [...scans.filter((item) => item.body.receipt_id !== scan.body.receipt_id), scan]);
}

/** Uploads what it can; a scan stays queued while the phone is offline. */
export async function drainScans(db: Store, services: MoneyServices): Promise<number> {
  const scans = await read(db);
  const left: QueuedScan[] = [];
  for (const scan of scans) {
    const photo = await services.uploadReceiptPhoto(scan.uri);
    if (photo.kind === 'offline') {
      left.push(scan);
      continue;
    }
    const posted = await services.postReceipt({
      ...scan.body,
      ...(photo.kind === 'ok' ? { media_key: photo.value } : {}),
    });
    if (posted.kind === 'offline') left.push(scan);
  }
  await write(db, left);
  return scans.length - left.length;
}

/** Uploads queued scans now and whenever the phone comes back online. */
export function useReceiptQueueDrain(services: MoneyServices): void {
  const { db, network } = useLocalFirst();
  useEffect(() => {
    let running = false;
    const drain = () => {
      if (running || !network.isOnline()) return;
      running = true;
      void drainScans(db, services).finally(() => {
        running = false;
      });
    };
    drain();
    return network.subscribe((online) => {
      if (online) drain();
    });
  }, [db, network, services]);
}
