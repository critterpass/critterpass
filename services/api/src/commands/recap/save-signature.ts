/**
 * `save_signature {media_id}` (doc delta): the stroke a traveller drew once (an uploaded media
 * object with purpose `signature`) becomes the signature on every stamp they sign; the stamps they
 * already signed before drawing it take it now, live on each recap's channel.
 */
import { outbox } from '@cp/db';
import { channelName, DomainError, RECAP_RT, saveSignaturePayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

async function ownSignatureKey(tx: pg.PoolClient, mediaId: string, uid: string): Promise<string> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ r2_key: string }>(
      "SELECT r2_key FROM media_objects WHERE id = $1 AND owner_id = $2 AND purpose = 'signature'",
      [mediaId, uid],
    ),
  );
  const key = rows[0]?.r2_key;
  if (key === undefined) throw new DomainError('NOT_FOUND', { reason: 'signature_media' });
  return key;
}

export const saveSignatureCommand = defineCommand({
  name: 'save_signature',
  v: 1,
  schema: saveSignaturePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await ownSignatureKey(tx, payload.media_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const key = await ownSignatureKey(tx, payload.media_id, ctx.uid);
    return asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO user_settings (user_id, signature_media_key) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET signature_media_key = EXCLUDED.signature_media_key`,
        [ctx.uid, key],
      );
      const { rows } = await tx.query<{ recap_id: string; signed_at: Date }>(
        `UPDATE stamp_signatures SET stroke_media_key = $2
          WHERE signer_id = $1 AND stroke_media_key IS NULL
         RETURNING recap_id, signed_at`,
        [ctx.uid, key],
      );
      const recaps = new Map(rows.map((row) => [row.recap_id, row.signed_at]));
      for (const [recapId, signedAt] of recaps) {
        await outbox(tx, channelName('recap', recapId), RECAP_RT.signature, {
          signer_id: ctx.uid,
          stroke_media_key: key,
          signed_at: signedAt.toISOString(),
        });
      }
      return { media_key: key, stamps: rows.length };
    });
  },
});
