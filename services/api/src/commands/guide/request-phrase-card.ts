/**
 * `request_phrase_card` (docs/api-contracts.md §4.8): a trip member asks for a custom phrase card
 * (say, "take me to this address" with their hotel's address). A curated card for the purpose and
 * language fills the text at once; the `phrase.tts` job writes any missing text and records the
 * audio when a voice is configured, else the app reads the card with on-device speech.
 */
import { emitEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  GUIDE_QUEUES,
  requestPhraseCardPayloadSchema,
  type PhraseJob,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const requestPhraseCardCommand = defineCommand({
  name: 'request_phrase_card',
  v: 1,
  schema: requestPhraseCardPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [payload.trip_id],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND');
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows: curated } = await tx.query<{
        text: string;
        gloss: string;
        romanisation: string | null;
      }>(
        `SELECT text, gloss, romanisation FROM phrase_cards
          WHERE language = $1 AND (context = $2 OR key = $2) AND app.is_live_release(release_id)
          ORDER BY key LIMIT 1`,
        [payload.language, payload.purpose],
      );
      const card = curated[0];
      const address = payload.address ?? null;
      await tx.query(
        `INSERT INTO custom_phrase_cards
           (id, user_id, trip_id, guide_id, purpose, language, register, address, text, romanisation, gloss)
         SELECT $1, $2, t.id, t.guide_id, $3, $4, $5, $6, $7, $8, $9 FROM trips t WHERE t.id = $10
         ON CONFLICT (id) DO NOTHING`,
        [
          ctx.opId,
          ctx.uid,
          payload.purpose,
          payload.language,
          payload.register,
          address,
          card === undefined ? null : address === null ? card.text : `${card.text}\n${address}`,
          card?.romanisation ?? null,
          card === undefined ? null : address === null ? card.gloss : `${card.gloss}\n${address}`,
          payload.trip_id,
        ],
      );
      const job: PhraseJob = { card_id: ctx.opId };
      await sendInTx(tx, GUIDE_QUEUES.phrase, job, { singletonKey: ctx.opId });
      await emitEvent(tx, {
        type: 'phrase.requested',
        aggregateKind: 'custom_phrase_card',
        aggregateId: ctx.opId,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: {
          card_id: ctx.opId,
          trip_id: payload.trip_id,
          user_id: ctx.uid,
          language: payload.language,
        },
      });
      return { card_id: ctx.opId, curated: card !== undefined };
    }),
});
