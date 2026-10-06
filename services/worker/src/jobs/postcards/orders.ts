/**
 * A mailing's per-recipient orders, changed one recipient at a time under a row lock: the mailing's
 * status follows from them (`mailingStatusOf`), and each change of that status is a
 * `postcard.mailing_updated` event (the payer's inbox hears about shipped and failed). Every order
 * failing turns the mailing `failed`, which gives the payer their one mailing for the trip back.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import {
  mailingStatusOf,
  postcardMailingTrackingSchema,
  type PostcardMailingOrder,
  type PostcardMailingStatus,
  type PostcardMailingTracking,
} from '@cp/domain';
import type pg from 'pg';

export interface MailingRow {
  readonly id: string;
  readonly trip_id: string;
  readonly postcard_id: string;
  readonly payer_id: string;
  readonly status: PostcardMailingStatus;
  readonly tracking: PostcardMailingTracking;
}

export async function loadMailing(
  tx: pg.PoolClient,
  mailingId: string,
  lock = false,
): Promise<MailingRow | undefined> {
  const { rows } = await tx.query<MailingRow & { tracking: unknown }>(
    `SELECT id, trip_id, postcard_id, payer_id, status, tracking FROM postcard_mailings
      WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [mailingId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  return { ...row, tracking: postcardMailingTrackingSchema.parse(row.tracking) };
}

export type OrderPatch = Partial<Omit<PostcardMailingOrder, 'updated_at'>>;

/** Applies `patches` (by recipient) to the mailing's orders; returns the mailing's new status. */
export async function updateOrders(
  pool: pg.Pool,
  mailingId: string,
  patches: Readonly<Record<string, OrderPatch>>,
  now: Date = new Date(),
): Promise<PostcardMailingStatus | undefined> {
  return withSystem(pool, async (tx) => {
    const mailing = await loadMailing(tx, mailingId, true);
    if (mailing === undefined) return undefined;
    const orders = { ...mailing.tracking.orders };
    for (const [uid, patch] of Object.entries(patches)) {
      const current = orders[uid];
      if (current === undefined) continue;
      orders[uid] = { ...current, ...stripUndefined(patch), updated_at: now.toISOString() };
    }
    const status = mailingStatusOf(Object.values(orders));
    await tx.query('UPDATE postcard_mailings SET tracking = $2, status = $3 WHERE id = $1', [
      mailingId,
      JSON.stringify({ ...mailing.tracking, orders }),
      status,
    ]);
    if (status !== mailing.status) {
      await appendDomainEvent(tx, {
        type: 'postcard.mailing_updated',
        aggregateKind: 'postcard',
        aggregateId: mailing.postcard_id,
        actorKind: 'system',
        actorId: null,
        tripId: mailing.trip_id,
        payload: {
          trip_id: mailing.trip_id,
          mailing_id: mailingId,
          payer_id: mailing.payer_id,
          status,
        },
      });
    }
    return status;
  });
}

function stripUndefined(patch: OrderPatch): OrderPatch {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
