/**
 * `send_postcard` (online): the postcard's maker sends it to crewmates on the trip. Each recipient
 * gets it in their inbox (`postcard.received`, filed from `postcard.sent`); the postcard itself is
 * already readable to the trip. Sending again to the same people files nothing new for a replay.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, sendPostcardPayloadSchema, type SendPostcardResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireCreator, travellerPostcard, tripTravellers } from './shared';

export const sendPostcardCommand = defineCommand({
  name: 'send_postcard',
  v: 1,
  schema: sendPostcardPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireCreator(await travellerPostcard(tx, payload.postcard_id), ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<SendPostcardResult> => {
    const postcard = await travellerPostcard(tx, payload.postcard_id);
    requireCreator(postcard, ctx.uid);
    const travellers = new Set(await tripTravellers(tx, postcard.trip_id));
    const to = [...new Set(payload.to_uids)];
    if (to.some((uid) => uid === ctx.uid || !travellers.has(uid))) {
      throw new DomainError('VALIDATION', { reason: 'not_a_crewmate' });
    }
    return asSystemRole(tx, async () => {
      await tx.query('UPDATE postcards SET sent_at = coalesce(sent_at, now()) WHERE id = $1', [
        postcard.id,
      ]);
      await appendDomainEvent(tx, {
        type: 'postcard.sent',
        aggregateKind: 'postcard',
        aggregateId: postcard.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: postcard.trip_id,
        payload: {
          trip_id: postcard.trip_id,
          postcard_id: postcard.id,
          sender_id: ctx.uid,
          to_uids: to,
        },
      });
      return { postcard_id: postcard.id, sent_to: to };
    });
  },
});
