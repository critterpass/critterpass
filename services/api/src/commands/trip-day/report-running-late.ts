/**
 * `report_running_late` (docs/api-contracts.md §4.12): a member tells the crew they are running
 * late for a plan item or the meet-up. The rest of the trip gets the crew ping and the crew chat
 * gets the member's own line ("Running 10 min late.").
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  channelName,
  DomainError,
  generateUuidV7,
  reportRunningLatePayloadSchema,
  runningLateLine,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireTripParticipant } from './shared';

export const reportRunningLateCommand = defineCommand({
  name: 'report_running_late',
  v: 1,
  schema: reportRunningLatePayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'trip_day',
  authorize: async (tx, payload, ctx) => {
    await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    const { rows } =
      payload.item_id !== undefined
        ? await tx.query('SELECT 1 FROM plan_items WHERE id = $1 AND trip_id = $2', [
            payload.item_id,
            payload.trip_id,
          ])
        : await tx.query('SELECT 1 FROM meetups WHERE id = $1 AND trip_id = $2', [
            payload.meetup_id,
            payload.trip_id,
          ]);
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'late_for' });
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ crew_id: string }>(
        'SELECT crew_id FROM trips WHERE id = $1',
        [payload.trip_id],
      );
      const crewId = rows[0]?.crew_id;
      if (crewId === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
      const messageId = generateUuidV7();
      const refKind = payload.item_id !== undefined ? 'plan_item' : 'meetup';
      const refId = payload.item_id ?? payload.meetup_id ?? null;
      const inserted = await tx.query<{ seq: string }>(
        `INSERT INTO messages (id, crew_id, trip_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
         VALUES ($1, $2, $3, 'user', $4, 'text', $5, $6, $7) RETURNING seq`,
        [
          messageId,
          crewId,
          payload.trip_id,
          ctx.uid,
          runningLateLine(payload.minutes),
          refKind,
          refId,
        ],
      );
      await outbox(tx, channelName('crew_chat', crewId), 'message.created', {
        crew_id: crewId,
        message_id: messageId,
        seq: Number(inserted.rows[0]?.seq),
      });
      await appendDomainEvent(tx, {
        type: 'member.running_late',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        crewId,
        payload: {
          trip_id: payload.trip_id,
          user_id: ctx.uid,
          minutes: payload.minutes,
          item_id: payload.item_id ?? null,
          meetup_id: payload.meetup_id ?? null,
        },
      });
      return { message_id: messageId, minutes: payload.minutes };
    }),
});
