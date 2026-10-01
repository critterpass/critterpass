/**
 * `announce_disruption {disruption_id}` (TELL THE CREW on 3k-5): the guide posts the disruption's
 * line into crew chat ("Three of you land at 13:50."), linked to the disruption so the chat shows
 * its card. An organiser or one of the disrupted travellers may post it; once per version.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  announceDisruptionPayloadSchema,
  channelName,
  DomainError,
  generateUuidV7,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireDisruption } from './shared';

export const announceDisruptionCommand = defineCommand({
  name: 'announce_disruption',
  v: 1,
  schema: announceDisruptionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const view = await requireDisruption(tx, payload.disruption_id, ctx.uid);
    if (!view.organiser && !view.traveller_ids.includes(ctx.uid)) {
      throw new DomainError('FORBIDDEN', { reason: 'not_organiser_or_affected' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const view = await requireDisruption(tx, payload.disruption_id, ctx.uid);
    return asSystemRole(tx, async () => {
      const posted = await tx.query<{ id: string }>(
        `SELECT m.id FROM messages m JOIN disruptions d ON d.id = m.ref_id
          WHERE m.ref_kind = 'disruption' AND m.ref_id = $1 AND m.body = d.summary
            AND m.deleted_at IS NULL LIMIT 1`,
        [view.id],
      );
      const existing = posted.rows[0]?.id;
      if (existing !== undefined) return { message_id: existing, posted: false };
      const messageId = generateUuidV7();
      const inserted = await tx.query<{ seq: string }>(
        `INSERT INTO messages (id, crew_id, trip_id, sender_kind, guide_id, type, body, ref_kind, ref_id)
         VALUES ($1, $2, $3, 'guide', $4, 'system', $5, 'disruption', $6) RETURNING seq`,
        [messageId, view.crew_id, view.trip_id, view.guide_id, view.summary || view.title, view.id],
      );
      await outbox(tx, channelName('crew_chat', view.crew_id), 'message.created', {
        crew_id: view.crew_id,
        message_id: messageId,
        seq: Number(inserted.rows[0]?.seq),
      });
      await appendDomainEvent(tx, {
        type: 'disruption.announced',
        aggregateKind: 'trip',
        aggregateId: view.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: view.crew_id,
        tripId: view.trip_id,
        payload: { trip_id: view.trip_id, disruption_id: view.id, message_id: messageId },
      });
      return { message_id: messageId, posted: true };
    });
  },
});
