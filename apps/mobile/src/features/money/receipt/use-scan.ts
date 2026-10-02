/**
 * The scan's capture and upload: the platform document scanner (or a photo from the library), the
 * on-device read with the trip's languages as hints, the photo upload and `POST /v1/receipts`, then
 * the synced `receipts` row the server's parse lands on. Offline, the scan is queued on the device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { useCallback, useEffect, useReducer, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows } from '../data/live-rows';
import { RECEIPT_SQL, RECEIPT_TABLES, type ReceiptRow } from '../data/queries';
import type { MoneyServices, ReaderResult } from '../data/services';
import { queueScan } from './receipt-queue';
import { INITIAL_SCAN, scanReducer, uploadStatus, type ScanState } from './scan-machine';

/** Language hints for the reader from the trip's local currency (a proxy for the country). */
const CURRENCY_LANGUAGES: Readonly<Record<string, readonly string[]>> = {
  IDR: ['id', 'en'],
  JPY: ['ja', 'en'],
  VND: ['vi', 'en'],
  THB: ['th', 'en'],
  SGD: ['en', 'zh'],
  MYR: ['ms', 'en', 'zh'],
  KRW: ['ko', 'en'],
  CNY: ['zh', 'en'],
  TWD: ['zh', 'en'],
  INR: ['hi', 'en'],
};

export function languagesFor(currency: string | null): readonly string[] {
  return (currency === null ? undefined : CURRENCY_LANGUAGES[currency]) ?? ['en'];
}

/** How long a parse may take before the screen offers a way out (it keeps waiting meanwhile). */
export const SLOW_PARSE_MS = 45_000;

/** True once `key` (the receipt being parsed) has been waited on for `ms`; a new key starts over. */
export function useWaitedTooLong(key: string | null, ms: number = SLOW_PARSE_MS): boolean {
  const [late, setLate] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return undefined;
    const timer = setTimeout(() => setLate(key), ms);
    return () => clearTimeout(timer);
  }, [key, ms]);
  return key !== null && late === key;
}

export interface ScanControls {
  readonly state: ScanState;
  readonly receipt: ReceiptRow | null;
  readonly read: ReaderResult | null;
  readonly scan: () => Promise<void>;
  readonly pick: () => Promise<void>;
  readonly retake: () => void;
  readonly typeLines: () => void;
}

export function useScan(
  services: MoneyServices,
  trip: { readonly id: string; readonly localCurrency: string | null } | null,
): ScanControls {
  const { db } = useLocalFirst();
  const [state, dispatch] = useReducer(scanReducer, INITIAL_SCAN);
  const receiptId = state.step === 'waiting' ? state.receiptId : null;
  const rows = useLiveRows<ReceiptRow>(
    RECEIPT_SQL,
    receiptId === null ? null : [receiptId],
    RECEIPT_TABLES,
  );

  const process = useCallback(
    async (uri: string) => {
      const reader = services.reader;
      if (reader === null || trip === null) return;
      dispatch({ type: 'captured', uri });
      let read: ReaderResult;
      try {
        read = await reader.recognize(uri, { languages: languagesFor(trip.localCurrency) });
      } catch {
        read = { status: 'no_text', lines: [], quality: null };
      }
      const id = generateUuidV7();
      dispatch({ type: 'read', result: read, receiptId: id });
      const body = {
        receipt_id: id,
        trip_id: trip.id,
        ocr_lines: read.lines.map((line) => ({
          id: line.id,
          text: line.text,
          bbox: [...line.bbox] as [number, number, number, number],
          conf: line.conf,
        })),
        ...(read.quality === null ? {} : { quality_issue: read.quality }),
        ocr_status: uploadStatus(read),
      };
      const photo = await services.uploadReceiptPhoto(uri);
      if (photo.kind === 'offline') {
        await queueScan(db, { uri, body });
        dispatch({ type: 'offline' });
        return;
      }
      const posted = await services.postReceipt({
        ...body,
        ...(photo.kind === 'ok' ? { media_key: photo.value } : {}),
      });
      if (posted.kind === 'offline') {
        await queueScan(db, { uri, body });
        dispatch({ type: 'offline' });
      } else if (posted.kind === 'error') {
        dispatch({ type: 'upload_error', code: posted.code });
      } else {
        dispatch({ type: 'posted' });
      }
    },
    [services, trip, db],
  );

  const scan = useCallback(async () => {
    const reader = services.reader;
    if (reader === null) return;
    try {
      const result = await reader.scanDocument({ pageLimit: 1 });
      const uri = result.status === 'captured' ? result.uris[0] : undefined;
      if (uri !== undefined) await process(uri);
    } catch {
      dispatch({ type: 'denied' });
    }
  }, [services, process]);

  const pick = useCallback(async () => {
    const picked = await services.pickPhoto();
    if (picked.kind === 'picked') await process(picked.uri);
    else if (picked.kind === 'denied') dispatch({ type: 'denied' });
  }, [services, process]);

  return {
    state,
    receipt: rows.rows[0] ?? null,
    read: state.step === 'uploading' || state.step === 'waiting' ? state.read : null,
    scan,
    pick,
    retake: () => dispatch({ type: 'retake' }),
    typeLines: () => dispatch({ type: 'type_lines' }),
  };
}
