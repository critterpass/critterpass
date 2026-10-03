/**
 * A swipe match drops into the trip's Ideas with everyone who said yes as a backer (the founder's
 * group swiping decision, docs/product-decisions.md). Only while `planning.redesign` is on: with it
 * off the match keeps becoming a ChangeSet suggestion, so installed apps get the answer they know.
 */
import { DomainError, PLANNING_CONFIG_DEFAULTS } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { backIdea, type IdeaPlace } from '../../commands/ideas';

/** The rollout switch for the redesigned plan and places (public `ops.ops_config`). */
export async function planningRedesignOn(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ value: unknown }>(
      "SELECT value FROM ops.ops_config WHERE key = 'planning.redesign'",
    ),
  );
  const value = rows[0]?.value;
  return typeof value === 'boolean' ? value : PLANNING_CONFIG_DEFAULTS['planning.redesign'];
}

export interface MatchIdeaInput {
  readonly tripId: string;
  readonly poiId: string;
  /** The yes voters, in the order they said yes; the last one made the match. */
  readonly userIds: readonly string[];
  readonly actorId: string;
}

/** Upserts the trip idea for the matched place; runs inside the vote transaction. */
export async function matchToIdea(tx: pg.PoolClient, input: MatchIdeaInput): Promise<string> {
  // The deck holds the destination's own places, so the match needs no destination check.
  const { rows } = await asSystemRole(tx, () =>
    tx.query<IdeaPlace & { crewId: string }>(
      `SELECT t.crew_id AS "crewId", p.id AS "poiId", p.name, p.name_local AS "nameLocal",
              p.category, p.lat, p.lng
         FROM trips t JOIN pois p ON p.id = $2 WHERE t.id = $1`,
      [input.tripId, input.poiId],
    ),
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'place' });
  const { crewId, ...place } = row;
  const backed = await backIdea(tx, {
    tripId: input.tripId,
    crewId,
    uid: input.actorId,
    backerIds: input.userIds,
    place,
    source: 'swipe',
  });
  return backed.ideaId;
}

/** The live idea for a place already matched, so a late yes reports the same idea. */
export async function ideaForPlace(
  tx: pg.PoolClient,
  tripId: string,
  poiId: string,
): Promise<string | null> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ id: string }>(
      'SELECT id FROM trip_ideas WHERE trip_id = $1 AND poi_id = $2 AND deleted_at IS NULL',
      [tripId, poiId],
    ),
  );
  return rows[0]?.id ?? null;
}
