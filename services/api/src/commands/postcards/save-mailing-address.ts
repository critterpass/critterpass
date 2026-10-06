/**
 * `save_mailing_address` (online): a traveller's own postal address for printed postcards, sealed
 * on the server (C3: never synced, never shown to the crew, never sent to a model). Saving it is
 * the consent to receive printed postcards and settles any "add an address" request; `fields:
 * null` deletes it and withdraws that consent.
 */
import { appendDomainEvent, crypto as dbCrypto } from '@cp/db';
import {
  DomainError,
  saveMailingAddressPayloadSchema,
  type SaveMailingAddressResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export type FieldKeyring = Parameters<typeof dbCrypto.encryptField>[1];

export function createSaveMailingAddressCommand(deps: { readonly keyring: FieldKeyring }) {
  return defineCommand({
    name: 'save_mailing_address',
    v: 1,
    schema: saveMailingAddressPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: () => Promise.resolve(),
    handle: async (tx, payload, ctx): Promise<SaveMailingAddressResult> =>
      asSystemRole(tx, async () => {
        const fields = payload.fields;
        if (fields === null) {
          await tx.query('DELETE FROM mailing_addresses WHERE user_id = $1', [ctx.uid]);
        } else {
          const sealed = dbCrypto.encryptField(JSON.stringify(fields), deps.keyring);
          if (sealed.length > 4000) throw new DomainError('VALIDATION', { reason: 'too_long' });
          await tx.query(
            `INSERT INTO mailing_addresses (user_id, fields_enc, country) VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE
                SET fields_enc = EXCLUDED.fields_enc, country = EXCLUDED.country`,
            [ctx.uid, sealed, fields.country],
          );
        }
        await appendDomainEvent(tx, {
          type: 'postcard.address_saved',
          aggregateKind: 'user',
          aggregateId: ctx.uid,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { user_id: ctx.uid, saved: fields !== null },
        });
        return { saved: fields !== null };
      }),
  });
}
