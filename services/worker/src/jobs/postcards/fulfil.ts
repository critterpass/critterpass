/**
 * `postcard.fulfil`: a Pass+ mailing becomes one print order per recipient. The postcard is drawn
 * print-ready once, each recipient's sealed address is opened only here and only to place their
 * order, and an address gone (or now somewhere the printer cannot reach) fails that recipient
 * alone. A refused order fails its recipient; a printer that is down is retried, and on the last
 * attempt the orders still waiting fail, so a mailing never hangs in `queued`. Every order failing
 * gives the payer their trip's mailing back and tells them (`postcard.mailing_updated`).
 * `postcard.status` re-reads every open order from the printer: the only way a status moves after
 * the order is placed (the printer's callbacks only ask for this re-read).
 */
import { crypto as dbCrypto, withSystem } from '@cp/db';
import {
  ALBUM_QUEUES,
  mailingAddressFieldsSchema,
  postcardFulfilJobSchema,
  postcardStatusJobSchema,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { PrintOrderRejected, type PrintVendor } from '../../print/adapter';
import { printShipsTo } from '../../print/coverage';
import type { PrintRenderer } from '../../print/render';
import type { AlbumMediaStore } from '../album/process-photo';
import { loadMailing, updateOrders, type OrderPatch } from './orders';

export type FieldKeyring = Parameters<typeof dbCrypto.decryptField>[1];

export interface FulfilDeps {
  readonly vendor: PrintVendor;
  readonly render: PrintRenderer;
  readonly store: Pick<AlbumMediaStore, 'get'>;
  readonly keyring: FieldKeyring;
  readonly callbackUrl?: string | undefined;
}

export type FulfilOutcome =
  | { readonly outcome: 'gone' | 'nothing_to_order' }
  | { readonly outcome: 'ordered'; readonly placed: number; readonly failed: number };

interface CardRow {
  readonly note: string;
  readonly photo_key: string | null;
  readonly place: string | null;
  readonly guide: string | null;
  readonly sender: string | null;
}

async function loadCard(tx: pg.PoolClient, postcardId: string): Promise<CardRow | undefined> {
  const { rows } = await tx.query<CardRow>(
    `SELECT p.note, coalesce(ph.display_key, ph.media_key) AS photo_key,
            coalesce(d.name, c.name) AS place, g.slug AS guide, u.display_name AS sender
       FROM postcards p
       JOIN trips t ON t.id = p.trip_id
       JOIN crews c ON c.id = t.crew_id
       JOIN users u ON u.id = p.created_by
       LEFT JOIN photos ph ON ph.id = p.photo_id AND ph.deleted_at IS NULL
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [postcardId],
  );
  return rows[0];
}

export async function fulfilMailing(
  pool: pg.Pool,
  deps: FulfilDeps,
  mailingId: string,
  finalAttempt: boolean,
): Promise<FulfilOutcome> {
  const loaded = await withSystem(pool, async (tx) => {
    const mailing = await loadMailing(tx, mailingId);
    if (mailing === undefined || mailing.status === 'failed') return undefined;
    const card = await loadCard(tx, mailing.postcard_id);
    const waiting = Object.entries(mailing.tracking.orders)
      .filter(([, order]) => order.ref === null && order.status === 'queued')
      .map(([uid]) => uid);
    const { rows: addresses } = await tx.query<{
      user_id: string;
      fields_enc: string;
      country: string;
    }>(
      'SELECT user_id, fields_enc, country FROM mailing_addresses WHERE user_id = ANY($1::uuid[])',
      [waiting],
    );
    return { mailing, card, waiting, addresses };
  });
  if (loaded === undefined) return { outcome: 'gone' };
  const { mailing, card, waiting, addresses } = loaded;
  if (waiting.length === 0) return { outcome: 'nothing_to_order' };
  if (card === undefined) {
    // The postcard was deleted before it could be printed: nothing can be ordered.
    await updateOrders(pool, mailingId, Object.fromEntries(waiting.map((uid) => [uid, failed])));
    return { outcome: 'ordered', placed: 0, failed: waiting.length };
  }

  const stored = card.photo_key === null ? null : await deps.store.get(card.photo_key);
  const photo =
    stored === null
      ? null
      : { bytes: stored.bytes, contentType: stored.contentType ?? 'image/jpeg' };
  const assets = await deps.render({
    tripId: mailing.trip_id,
    postcardId: mailing.postcard_id,
    tripName: card.place ?? '',
    place: card.place ?? '',
    note: card.note,
    senderName: card.sender ?? '',
    guide: card.guide ?? 'tokek',
    photo,
  });

  const byUser = new Map(addresses.map((row) => [row.user_id, row]));
  let placed = 0;
  let failedCount = 0;
  let transient: Error | undefined;
  for (const uid of waiting) {
    const address = byUser.get(uid);
    if (address === undefined || !printShipsTo(address.country)) {
      await updateOrders(pool, mailingId, { [uid]: failed });
      failedCount += 1;
      continue;
    }
    const fields = mailingAddressFieldsSchema.parse(
      JSON.parse(dbCrypto.decryptField(address.fields_enc, deps.keyring)),
    );
    try {
      const order = await deps.vendor.createOrder({
        reference: `${mailingId}:${uid}`,
        address: fields,
        frontUrl: assets.frontUrl,
        backUrl: assets.backUrl,
        callbackUrl: deps.callbackUrl,
      });
      await updateOrders(pool, mailingId, {
        [uid]: {
          ref: order.ref,
          status: order.status === 'queued' ? 'sent' : order.status,
          carrier: order.carrier,
          tracking_url: order.trackingUrl,
          eta: order.eta,
        },
      });
      placed += 1;
    } catch (error) {
      if (error instanceof PrintOrderRejected || finalAttempt) {
        await updateOrders(pool, mailingId, { [uid]: failed });
        failedCount += 1;
      } else {
        transient = error instanceof Error ? error : new Error(String(error));
      }
    }
  }
  if (transient !== undefined) throw transient;
  return { outcome: 'ordered', placed, failed: failedCount };
}

const failed: OrderPatch = { status: 'failed' };

/** Re-reads every placed, unfinished order of a mailing from the printer. */
export async function refreshMailing(
  pool: pg.Pool,
  vendor: Pick<PrintVendor, 'getStatus'>,
  mailingId: string,
): Promise<{ readonly checked: number }> {
  const mailing = await withSystem(pool, (tx) => loadMailing(tx, mailingId));
  if (mailing === undefined) return { checked: 0 };
  const open = Object.entries(mailing.tracking.orders).filter(
    ([, order]) => order.ref !== null && order.status !== 'failed' && order.status !== 'shipped',
  );
  const patches: Record<string, OrderPatch> = {};
  for (const [uid, order] of open) {
    const status = await vendor.getStatus(order.ref ?? '');
    patches[uid] = {
      status: status.status === 'queued' ? 'sent' : status.status,
      carrier: status.carrier,
      tracking_url: status.trackingUrl,
      eta: status.eta,
    };
  }
  if (open.length > 0) await updateOrders(pool, mailingId, patches);
  return { checked: open.length };
}

export function postcardFulfilJob(deps: FulfilDeps): AnyJobDefinition {
  return defineJob({
    queue: ALBUM_QUEUES.postcardFulfil,
    schema: postcardFulfilJobSchema,
    singletonKey: (data) => data.mailing_id,
    async handler(data, ctx) {
      return { ...(await fulfilMailing(ctx.pool, deps, data.mailing_id, ctx.job.isFinalAttempt)) };
    },
  });
}

export function postcardStatusJob(vendor: Pick<PrintVendor, 'getStatus'>): AnyJobDefinition {
  return defineJob({
    queue: ALBUM_QUEUES.postcardStatus,
    schema: postcardStatusJobSchema,
    singletonKey: (data) => data.mailing_id,
    async handler(data, ctx) {
      return { ...(await refreshMailing(ctx.pool, vendor, data.mailing_id)) };
    },
  });
}
