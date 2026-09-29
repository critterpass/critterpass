/**
 * `mark_reveal_seen` (docs/api-contracts.md §4.4): the winner reveal was shown on one of the
 * voter's devices, so none of them shows it again (the row syncs on `me`). Idempotent: the first
 * sighting wins.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, markRevealSeenPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { visiblePoll } from './shared';

export const markRevealSeenCommand = defineCommand({
  name: 'mark_reveal_seen',
  v: 1,
  schema: markRevealSeenPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const state = await visiblePoll(tx, payload.poll_id);
    if (state.poll.status !== 'closed')
      throw new DomainError('STATE_INVALID', { reason: 'not_closed' });
  },
  handle: async (tx, payload, ctx): Promise<{ poll_id: string; seen_at: string }> => {
    const now = ctx.clock.serverNow;
    const { rows } = await tx.query<{ seen_at: Date; first: boolean }>(
      `INSERT INTO poll_reveals (poll_id, user_id, seen_at) VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, user_id)
         DO UPDATE SET seen_at = coalesce(poll_reveals.seen_at, EXCLUDED.seen_at)
       RETURNING seen_at, (seen_at = $3) AS first`,
      [payload.poll_id, ctx.uid, now],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('poll reveal upsert returned no row');
    if (row.first) {
      const { rows: scope } = await tx.query<{ crew_id: string; trip_id: string | null }>(
        'SELECT crew_id, trip_id FROM polls WHERE id = $1',
        [payload.poll_id],
      );
      await appendDomainEvent(tx, {
        type: 'poll.reveal_seen',
        aggregateKind: 'poll',
        aggregateId: payload.poll_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { poll_id: payload.poll_id, user_id: ctx.uid },
        crewId: scope[0]?.crew_id ?? null,
        ...(scope[0]?.trip_id ? { tripId: scope[0].trip_id } : {}),
      });
    }
    return { poll_id: payload.poll_id, seen_at: row.seen_at.toISOString() };
  },
});
