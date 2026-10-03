/**
 * `react_memory {memory_id, emoji?, text?}` (offline, 3m-10): a traveller reacts to the trip's
 * year-later memory with an emoji, a short line (≤ 40 characters) or both; a new reaction replaces
 * their last. Reactions pop in live on `memory:{id}` for everyone who has the memory open.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, DomainError, RECAP_RT, reactMemoryPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

async function visibleMemory(tx: pg.PoolClient, memoryId: string): Promise<{ trip_id: string }> {
  const { rows } = await tx.query<{ trip_id: string }>(
    'SELECT trip_id FROM memories WHERE id = $1',
    [memoryId],
  );
  const memory = rows[0];
  if (memory === undefined) throw new DomainError('NOT_FOUND', { reason: 'memory' });
  return memory;
}

export const reactMemoryCommand = defineCommand({
  name: 'react_memory',
  v: 1,
  schema: reactMemoryPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await visibleMemory(tx, payload.memory_id);
  },
  handle: async (tx, payload, ctx) => {
    const memory = await visibleMemory(tx, payload.memory_id);
    const emoji = payload.emoji ?? null;
    const text = payload.text ?? null;
    await asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO memory_reactions (memory_id, trip_id, user_id, emoji, text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (memory_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, text = EXCLUDED.text`,
        [payload.memory_id, memory.trip_id, ctx.uid, emoji, text],
      );
      await appendDomainEvent(tx, {
        type: 'memory.reacted',
        aggregateKind: 'memory',
        aggregateId: payload.memory_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: memory.trip_id,
        payload: { trip_id: memory.trip_id, memory_id: payload.memory_id, user_id: ctx.uid },
      });
    });
    await outbox(tx, channelName('memory', payload.memory_id), RECAP_RT.reaction, {
      user_id: ctx.uid,
      emoji,
      text,
    });
    return { memory_id: payload.memory_id, emoji, text };
  },
});
