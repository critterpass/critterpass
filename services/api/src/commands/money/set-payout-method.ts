/**
 * `set_payout_method` (docs/api-contracts.md §4.1, C3): how the caller gets paid back. The details
 * are checked against their kind, encrypted with the field keyring before they touch the database,
 * and never appear in the result, an event, a hint or a log; one live method per kind, and removing
 * one keeps nothing readable. Only `app.reveal_payout` ever shows them to someone else.
 */
import { crypto as dbCrypto, emitEvent } from '@cp/db';
import {
  DomainError,
  parsePayoutDetails,
  setPayoutMethodPayloadSchema,
  type PayoutDetails,
  type PayoutKind,
} from '@cp/domain';
import { ZodError } from 'zod';

import { defineCommand } from '../_framework/define-command';

type Keyring = dbCrypto.FieldEncryptionKeyring;

const KIND_NAMES: Readonly<Record<PayoutKind, string>> = {
  bank: 'Bank',
  paynow: 'PayNow',
  promptpay: 'PromptPay',
  vietqr: 'VietQR',
  duitnow: 'DuitNow',
  wise_link: 'Wise',
  cash: 'Cash',
};

const last4 = (value: string) => `••${value.replace(/\s/gu, '').slice(-4)}`;

/** The payee's own label for the method ("DBS ••1234", "PayNow ••5678"). */
export function payoutLabel(kind: PayoutKind, details: PayoutDetails): string {
  if ('bank_name' in details) return `${details.bank_name} ${last4(details.account_number)}`;
  if ('account_number' in details) return `${KIND_NAMES[kind]} ${last4(details.account_number)}`;
  if ('proxy' in details) return `${KIND_NAMES[kind]} ${last4(details.proxy)}`;
  return KIND_NAMES[kind];
}

export function createSetPayoutMethodCommand(deps: { readonly keyring: Keyring }) {
  return defineCommand({
    name: 'set_payout_method',
    v: 1,
    schema: setPayoutMethodPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: () => Promise.resolve(),
    handle: async (tx, payload, ctx) => {
      await tx.query(
        `UPDATE payout_methods SET deleted_at = $3
          WHERE user_id = $1 AND kind = $2 AND deleted_at IS NULL`,
        [ctx.uid, payload.kind, ctx.clock.serverNow],
      );
      let methodId: string | null = null;
      if (!payload.remove) {
        let details: PayoutDetails;
        try {
          details = parsePayoutDetails(payload.kind, payload.details);
        } catch (error) {
          if (!(error instanceof ZodError)) throw error;
          // Field paths only: a payout value never goes back out, not even in an error.
          throw new DomainError('VALIDATION', {
            reason: 'payout_details',
            fields: error.issues.map((issue) => issue.path.join('.')),
          });
        }
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO payout_methods (user_id, kind, country, label, details_enc)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            ctx.uid,
            payload.kind,
            payload.country ?? null,
            payoutLabel(payload.kind, details),
            payload.kind === 'cash'
              ? null
              : dbCrypto.encryptField(JSON.stringify(details), deps.keyring),
          ],
        );
        methodId = rows[0]?.id ?? null;
      }
      await emitEvent(tx, {
        type: 'profile.payout_set',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, kind: payload.kind, removed: payload.remove },
      });
      return { method_id: methodId, kind: payload.kind, removed: payload.remove };
    },
  });
}
