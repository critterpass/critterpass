/**
 * Settle XP: when the last payment clears a trip (`trip.settled`, the moment the money feature
 * grants the Settled Tokek), the crew and every member who got the sticker earn the settle XP once.
 * No sticker is granted here: the settle confirm already granted it, with its one `granted_at`.
 */
import { XP_SOURCES } from '@cp/domain';
import type pg from 'pg';

import { grantXp } from './xp';

export async function settleXp(
  tx: pg.PoolClient,
  event: {
    readonly trip_id: string | null;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly occurred_at: Date;
  },
): Promise<boolean> {
  const crewId = event.payload['crew_id'];
  const tripId = event.trip_id;
  const users = event.payload['user_ids'];
  if (typeof crewId !== 'string' || tripId === null) return false;
  const grantedAt = event.payload['granted_at'];
  const result = await grantXp(tx, {
    crewId,
    tripId,
    userIds: Array.isArray(users) ? users.filter((u): u is string => typeof u === 'string') : [],
    amount: XP_SOURCES.settle,
    sourceKind: 'settle',
    sourceId: tripId,
    at: typeof grantedAt === 'string' ? new Date(grantedAt) : event.occurred_at,
  });
  return result.granted;
}
