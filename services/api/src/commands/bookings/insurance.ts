/**
 * The travel-insurance vault (doc delta): `save_insurance_policy` and `delete_insurance_policy`
 * (self) keep a member's policy with its number and assistance line sealed (AES-256-GCM, written as
 * the server; app_user never reads those columns), and `share_insurance` shares it with one help
 * session: only with the `insurance_to_clinic` consent (given now with `grant_consent`, or earlier),
 * recording the exact text the member approved. Without the consent it is `CONSENT_REQUIRED`.
 */
import { crypto as dbCrypto, emitEvent } from '@cp/db';
import {
  deleteInsurancePolicyPayloadSchema,
  DomainError,
  saveInsurancePolicyPayloadSchema,
  shareInsurancePayloadSchema,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { parseMediaKey } from '../../media/purposes';
import { defineCommand } from '../_framework/define-command';
import type { FieldKeyring } from './deps';
import { requireTripParticipant } from './shared';

export function createSaveInsurancePolicyCommand(deps: { readonly keyring: FieldKeyring }) {
  return defineCommand({
    name: 'save_insurance_policy',
    v: 1,
    schema: saveInsurancePolicyPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      if (payload.trip_id !== undefined) await requireTripParticipant(tx, payload.trip_id, ctx.uid);
      if (
        payload.doc_media_key !== undefined &&
        parseMediaKey(payload.doc_media_key)?.ownerId !== ctx.uid
      ) {
        throw new DomainError('VALIDATION', { reason: 'document_not_yours' });
      }
    },
    handle: async (tx, payload, ctx) => {
      const seal = (value: string) => dbCrypto.encryptField(value, deps.keyring);
      const saved = await asSystemRole(tx, async () => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO insurance_policies (id, user_id, trip_id, provider, policy_no_enc,
             assistance_phone_enc, doc_media_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE
             SET trip_id = EXCLUDED.trip_id, provider = EXCLUDED.provider,
                 policy_no_enc = EXCLUDED.policy_no_enc,
                 assistance_phone_enc = EXCLUDED.assistance_phone_enc,
                 doc_media_key = EXCLUDED.doc_media_key
             WHERE insurance_policies.user_id = EXCLUDED.user_id AND insurance_policies.deleted_at IS NULL
           RETURNING id`,
          [
            payload.policy_id,
            ctx.uid,
            payload.trip_id ?? null,
            payload.provider,
            seal(payload.policy_no),
            payload.assistance_phone === undefined ? null : seal(payload.assistance_phone),
            payload.doc_media_key ?? null,
          ],
        );
        return rows[0];
      });
      if (saved === undefined) throw new DomainError('NOT_FOUND', { reason: 'policy' });
      await emitEvent(tx, {
        type: 'insurance.saved',
        aggregateKind: 'insurance_policy',
        aggregateId: saved.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, policy_id: saved.id },
      });
      return { policy_id: saved.id };
    },
  });
}

export const deleteInsurancePolicyCommand = defineCommand({
  name: 'delete_insurance_policy',
  v: 1,
  schema: deleteInsurancePolicyPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx) => {
    const deleted = await asSystemRole(tx, () =>
      tx.query(
        `UPDATE insurance_policies SET deleted_at = $3, policy_no_enc = '', assistance_phone_enc = NULL
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [payload.policy_id, ctx.uid, ctx.clock.serverNow],
      ),
    );
    if ((deleted.rowCount ?? 0) === 0) throw new DomainError('NOT_FOUND', { reason: 'policy' });
    await emitEvent(tx, {
      type: 'insurance.deleted',
      aggregateKind: 'insurance_policy',
      aggregateId: payload.policy_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { user_id: ctx.uid, policy_id: payload.policy_id },
    });
    return { policy_id: payload.policy_id };
  },
});

export const shareInsuranceCommand = defineCommand({
  name: 'share_insurance',
  v: 1,
  schema: shareInsurancePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx) => {
    if (payload.grant_consent === true) {
      await asSystemRole(tx, () =>
        tx.query(
          `INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'insurance_to_clinic', now())
           ON CONFLICT (user_id, purpose) DO UPDATE SET granted_at = now(), revoked_at = NULL`,
          [ctx.uid],
        ),
      );
    }
    const { rows } = await tx.query<{ approval_id: string; policy_id: string }>(
      'SELECT approval_id, policy_id FROM app.share_insurance($1, $2)',
      [payload.help_session_id, payload.text_shown],
    );
    const shared = rows[0];
    if (shared === undefined) {
      const consent = await tx.query(
        `SELECT 1 FROM consents WHERE user_id = $1 AND purpose = 'insurance_to_clinic'
            AND granted_at IS NOT NULL AND revoked_at IS NULL`,
        [ctx.uid],
      );
      if ((consent.rowCount ?? 0) === 0) {
        throw new DomainError('CONSENT_REQUIRED', { purpose: 'insurance_to_clinic' });
      }
      throw new DomainError('NOT_FOUND', { reason: 'policy' });
    }
    await emitEvent(tx, {
      type: 'insurance.shared',
      aggregateKind: 'insurance_policy',
      aggregateId: shared.policy_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        user_id: ctx.uid,
        policy_id: shared.policy_id,
        help_session_id: payload.help_session_id,
      },
    });
    return { help_session_id: payload.help_session_id, policy_id: shared.policy_id };
  },
});
