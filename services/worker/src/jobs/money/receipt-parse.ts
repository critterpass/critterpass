/**
 * `ai.receipt` (docs/api-contracts-async.md §2.2, one per receipt): reads a scan into validated
 * lines and split suggestions and writes them onto the synced `receipts` row. A photo the device
 * could not read (no lines, or a script its OCR lacks) is transcribed on the server first. Every
 * amount is checked against the text of the line it cites (`@cp/ai`'s validator); nothing the
 * model says reaches the row unchecked. Without a model the scan fails over to the manual paths.
 */
import { parseReceipt, transcribeReceipt, type Gateway, type OcrLine } from '@cp/ai';
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { emitEvent, outbox, withSystem } from '@cp/db';
import { MONEY_QUEUES, userChannel } from '@cp/domain';
import type pg from 'pg';
import sharp from 'sharp';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import type { AvatarMediaStore } from '../avatar/media-store';
import { suggestSplit } from './receipt-suggestions';

export const receiptJobSchema = z.object({ receipt_id: z.uuid() });
export type ReceiptJob = z.infer<typeof receiptJobSchema>;

export interface ReceiptParseDeps {
  /** The gateway for this receipt's owner (usage is recorded against them); none = no model. */
  readonly gatewayFor?: ((userId: string) => Pick<Gateway, 'callModel'>) | undefined;
  readonly store?: Pick<AvatarMediaStore, 'get'> | undefined;
}

interface ReceiptRow {
  readonly id: string;
  readonly user_id: string;
  readonly trip_id: string;
  readonly status: string;
  readonly media_key: string | null;
  readonly ocr_source: 'device' | 'server';
  readonly ocr_lines: OcrLine[];
  readonly currency_hint: string;
}

const exponentOf = (code: string) => (isKnownCurrency(code) ? currencyExponent(code) : undefined);

async function serverLines(
  receipt: ReceiptRow,
  deps: ReceiptParseDeps,
  gateway: Pick<Gateway, 'callModel'>,
): Promise<OcrLine[]> {
  if (deps.store === undefined || receipt.media_key === null) return [];
  const photo = await deps.store.get(receipt.media_key);
  if (photo === null) return [];
  const jpeg = await sharp(photo.bytes)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return transcribeReceipt(
    gateway,
    { base64: jpeg.toString('base64'), mediaType: 'image/jpeg' },
    { userId: receipt.user_id },
  );
}

export type ReceiptOutcome = 'parsed' | 'partial' | 'failed' | 'skipped';

export async function parseStoredReceipt(
  pool: pg.Pool,
  receiptId: string,
  deps: ReceiptParseDeps,
): Promise<ReceiptOutcome> {
  const receipt = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<ReceiptRow>(
      `SELECT r.id, r.user_id, r.trip_id, r.status, r.media_key, r.ocr_source, r.ocr_lines,
              coalesce(t.local_currency, d.currency, c.settlement_currency, 'USD') AS currency_hint
         FROM receipts r JOIN trips t ON t.id = r.trip_id JOIN crews c ON c.id = r.crew_id
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE r.id = $1`,
      [receiptId],
    );
    return rows[0];
  });
  if (receipt?.status !== 'queued') return 'skipped';
  const gateway = deps.gatewayFor?.(receipt.user_id);
  let lines = receipt.ocr_lines;
  if (gateway !== undefined && (receipt.ocr_source === 'server' || lines.length === 0)) {
    lines = await serverLines(receipt, deps, gateway);
  }
  const parsed =
    gateway === undefined
      ? null
      : await parseReceipt(
          gateway,
          { lines, currencyHint: receipt.currency_hint, exponentOf },
          { userId: receipt.user_id, tripId: receipt.trip_id },
        );
  const status = parsed?.status ?? 'failed';
  return withSystem(pool, async (tx) => {
    const flags = await tx.query<{ user_id: string; flags: string[] }>(
      'SELECT user_id, flags FROM participant_dietary_flags WHERE trip_id = $1',
      [receipt.trip_id],
    );
    const suggestions =
      parsed === null || status === 'failed'
        ? null
        : suggestSplit({
            scannerId: receipt.user_id,
            lines: parsed.lines,
            flags: new Map(flags.rows.map((row) => [row.user_id, row.flags])),
          });
    const { rowCount } = await tx.query(
      `UPDATE receipts SET ocr_lines = $2, parsed = $3, suggestions = $4, status = $5,
         failure_reason = $6, parsed_at = now()
       WHERE id = $1 AND status = 'queued'`,
      [
        receipt.id,
        JSON.stringify(lines),
        parsed === null ? null : JSON.stringify(parsed),
        suggestions === null ? null : JSON.stringify(suggestions),
        status,
        parsed === null ? 'no_model' : status === 'failed' ? 'unreadable' : null,
      ],
    );
    if ((rowCount ?? 0) === 0) return 'skipped';
    await outbox(tx, userChannel(receipt.user_id), 'receipt.parsed', {
      receipt_id: receipt.id,
      status,
    });
    await emitEvent(tx, {
      type: 'receipt.parsed',
      aggregateKind: 'receipt',
      aggregateId: receipt.id,
      actorKind: 'system',
      actorId: null,
      tripId: receipt.trip_id,
      payload: { receipt_id: receipt.id, trip_id: receipt.trip_id, status },
    });
    return status;
  });
}

export function receiptParseJob(deps: ReceiptParseDeps): JobDefinition<ReceiptJob> {
  return defineJob({
    queue: MONEY_QUEUES.receipt,
    schema: receiptJobSchema,
    singletonKey: (data: ReceiptJob) => data.receipt_id,
    handler: async (data, ctx) => ({
      outcome: await parseStoredReceipt(ctx.pool, data.receipt_id, deps),
    }),
  });
}
