/**
 * `remove_idea` (docs/api-contracts-planning.md): the caller stops backing an idea. The last
 * backer leaving, or an organiser, removes the idea from the trip; another member who never
 * backed it is refused.
 */
import { DomainError, removeIdeaPayloadSchema, type RemoveIdeaResult } from '@cp/domain';
import type pg from 'pg';

import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';
import { leaveIdea } from './store';

interface VisibleIdea {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly backer_ids: string[];
}

/** Read as the caller: an idea on a trip they cannot see is not found. */
async function visibleIdea(tx: pg.PoolClient, ideaId: string): Promise<VisibleIdea> {
  const { rows } = await tx.query<VisibleIdea>(
    `SELECT i.trip_id, t.crew_id, i.backer_ids FROM trip_ideas i JOIN trips t ON t.id = i.trip_id
      WHERE i.id = $1 AND i.deleted_at IS NULL`,
    [ideaId],
  );
  const idea = rows[0];
  if (idea === undefined) throw new DomainError('NOT_FOUND', { reason: 'idea' });
  return idea;
}

export const removeIdeaCommand = defineCommand({
  name: 'remove_idea',
  v: 1,
  schema: removeIdeaPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const idea = await visibleIdea(tx, payload.idea_id);
    const access = await requireTripMember(tx, idea.trip_id);
    if (!access.organiser && !idea.backer_ids.includes(ctx.uid)) {
      throw new DomainError('FORBIDDEN', { reason: 'not_backer' });
    }
  },
  handle: async (tx, payload, ctx): Promise<RemoveIdeaResult> => {
    const idea = await visibleIdea(tx, payload.idea_id);
    const access = await requireTripMember(tx, idea.trip_id);
    const left = await leaveIdea(tx, {
      tripId: idea.trip_id,
      crewId: idea.crew_id,
      uid: ctx.uid,
      ideaId: payload.idea_id,
      removeAll: access.organiser,
    });
    return { idea_id: left.ideaId, removed: left.removed, backer_ids: left.backerIds };
  },
});
