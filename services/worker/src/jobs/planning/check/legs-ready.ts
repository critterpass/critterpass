/**
 * Whether the version the check is about to read has its travel stored. The check reads stored
 * legs and only guesses (straight lines, about twice a real drive on winding roads) where a pair
 * has none, so a run between an edit and its legs reports clashes that are not there. A version
 * waits for its legs: carried from the version before for pairs the edit left alone, routed by the
 * legs job for the rest, whose `plan.legs_updated` queues the check again. A version older than
 * `LEGS_WAIT_MS` is checked on what it has, so a legs job that never lands cannot hold the check.
 */
import type pg from 'pg';

import { loadTripLegsInput } from '../legs/load';
import { versionPairs } from '../legs/pairs';

export const LEGS_WAIT_MS = 5 * 60_000;

export async function legsPending(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
  now: Date,
): Promise<boolean> {
  const { rows: versions } = await tx.query<{ created_at: Date }>(
    'SELECT created_at FROM itinerary_versions WHERE id = $1',
    [versionId],
  );
  const created = versions[0]?.created_at;
  if (created === undefined || now.getTime() - created.getTime() > LEGS_WAIT_MS) return false;
  const input = await loadTripLegsInput(tx, tripId, versionId);
  const days = input?.versions[0]?.days ?? [];
  const wanted = versionPairs(days);
  if (wanted.length === 0) return false;
  const { rows } = await tx.query<{ from_key: string; to_key: string }>(
    'SELECT from_key, to_key FROM plan_legs WHERE version_id = $1',
    [versionId],
  );
  const stored = new Set(rows.map((row) => `${row.from_key}>${row.to_key}`));
  return wanted.some((pair) => !stored.has(`${pair.fromKey}>${pair.toKey}`));
}
