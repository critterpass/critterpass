/**
 * `queue_pitch {crew_id, pitch_id}` (doc delta to docs/api-contracts.md §4.4): keep a pitched place
 * for the crew's next board (while a final is on, or after it went back in the deck). Queued
 * pitches join the next destination board when it opens.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, queuePitchPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireCrewMember } from './shared';

export const queuePitchCommand = defineCommand({
  name: 'queue_pitch',
  v: 1,
  schema: queuePitchPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireCrewMember(tx, payload.crew_id);
  },
  handle: async (tx, payload, ctx): Promise<{ pitch_id: string; status: string }> => {
    const { rows } = await tx.query<{ destination_id: string; status: string }>(
      'SELECT destination_id, status FROM pitches WHERE id = $1 AND crew_id = $2',
      [payload.pitch_id, payload.crew_id],
    );
    const pitch = rows[0];
    if (pitch === undefined) throw new DomainError('NOT_FOUND', { reason: 'pitch' });
    if (pitch.status === 'queued') return { pitch_id: payload.pitch_id, status: 'queued' };
    if (pitch.status !== 'pitched' && pitch.status !== 'back_in_deck') {
      throw new DomainError('STATE_INVALID', { reason: 'pitch_in_vote', status: pitch.status });
    }
    return asSystemRole(tx, async () => {
      await tx.query("UPDATE pitches SET status = 'queued', trip_id = NULL WHERE id = $1", [
        payload.pitch_id,
      ]);
      await appendDomainEvent(tx, {
        type: 'pitch.queued',
        aggregateKind: 'pitch',
        aggregateId: payload.pitch_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          pitch_id: payload.pitch_id,
          crew_id: payload.crew_id,
          destination_id: pitch.destination_id,
        },
        crewId: payload.crew_id,
      });
      return { pitch_id: payload.pitch_id, status: 'queued' };
    });
  },
});
