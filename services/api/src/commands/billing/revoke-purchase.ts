/**
 * `revoke_purchase` (system only, docs/api-contracts.md §4.15): a store refund or revocation of a
 * one-off purchase, applied once. The transaction is stamped, its product's handler undoes what it
 * unlocked (a boost is revoked and its unsettled IOUs reversed), and the buyer's entitlements are
 * recomputed. Subscriptions are revoked by the RevenueCat sync, which reads the refund itself.
 */
import {
  DomainError,
  PRODUCT_ROLES,
  revokePurchasePayloadSchema,
  type ProductKey,
} from '@cp/domain';
import type pg from 'pg';

import { recomputeUser } from '../../entitlements';
import { asServer } from '../../billing/as-server';
import { purchaseHandler } from '../../billing/fulfilment';
import { stampRevoked } from '../../billing/store-records';
import { defineCommand } from '../_framework/define-command';

export interface RevokeOutcome {
  readonly revoked: boolean;
  readonly transaction_id: string;
}

export function revokePurchase(
  tx: pg.PoolClient,
  payload: { platform: 'app_store' | 'play'; transaction_id: string; reason: 'refund' | 'revoke' },
  now: Date,
): Promise<RevokeOutcome> {
  return asServer(tx, async () => {
    const stamped = await stampRevoked(
      tx,
      payload.platform,
      payload.transaction_id,
      payload.reason,
      now,
    );
    if (stamped === undefined) throw new DomainError('NOT_FOUND', { reason: 'transaction' });
    if (!stamped.newly) return { revoked: false, transaction_id: payload.transaction_id };
    const handler = purchaseHandler(PRODUCT_ROLES[stamped.row.productKey as ProductKey]);
    const outcome = await handler?.revoke?.(tx, stamped.row, payload.reason, now);
    const users = new Set([stamped.row.userId, ...(outcome?.users ?? [])].filter(Boolean));
    for (const user of users) await recomputeUser(tx, user);
    return { revoked: true, transaction_id: payload.transaction_id };
  });
}

export const revokePurchaseCommand = defineCommand({
  name: 'revoke_purchase',
  v: 1,
  schema: revokePurchasePayloadSchema,
  offline: false,
  internal: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) => revokePurchase(tx, payload, ctx.clock.serverNow),
});
