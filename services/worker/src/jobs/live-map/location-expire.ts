/**
 * `location.expire` (docs/api-contracts-async.md §2.3): fired by the timer `set_location_share`
 * arms at a crew-map share's end (last-day midnight in the destination zone). Announces the end
 * with `share.ended` (unless the share was already turned off or revoked earlier, which announced
 * itself), purges the share's fixes, and once the crew map is closed for the trip, unsubscribes
 * everyone from `trip_locations:` and ends the meet-up.
 */
import { outbox, scheduledJobDataSchema, withSystem } from '@cp/db';
import { crewMapChannel } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { closeCrewMap } from './unsubscribe-on-change';

export const LOCATION_EXPIRE_QUEUE = 'location.expire';
/** A share that ended this long before its timer ended some other way and was announced then. */
const ENDED_EARLY_MS = 60_000;

interface ShareRow {
  trip_id: string;
  user_id: string;
  reason: string;
  ends_at: Date | null;
  open: boolean;
}

export interface ExpireResult {
  readonly announced: boolean;
  readonly closed: boolean;
  readonly purged: number;
}

export async function expireShare(
  pool: pg.Pool,
  shareId: string,
  dueAt: Date,
  now: Date = new Date(),
): Promise<ExpireResult> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<ShareRow>(
      `SELECT s.trip_id, s.user_id, s.reason, s.ends_at, app.crew_map_open(s.trip_id) AS open
         FROM location_shares s WHERE s.id = $1 FOR UPDATE`,
      [shareId],
    );
    const share = rows[0];
    if (share?.reason !== 'crew_map' || share.ends_at === null) {
      return { announced: false, closed: false, purged: 0 };
    }
    if (share.ends_at.getTime() > now.getTime()) {
      return { announced: false, closed: false, purged: 0 };
    }
    const announced = share.ends_at.getTime() >= dueAt.getTime() - ENDED_EARLY_MS;
    if (announced) {
      await outbox(tx, crewMapChannel(share.trip_id), 'share.ended', {
        uid: share.user_id,
        share_id: shareId,
        reason: 'window_ended',
      });
    }
    const purged = await tx.query('DELETE FROM location_fixes WHERE share_id = $1', [shareId]);
    if (!share.open) await closeCrewMap(tx, share.trip_id, 'window_ended');
    return { announced, closed: !share.open, purged: purged.rowCount ?? 0 };
  });
}

export function locationExpireJob(): AnyJobDefinition {
  return defineJob({
    queue: LOCATION_EXPIRE_QUEUE,
    schema: scheduledJobDataSchema,
    async handler(data, { pool }) {
      const result = await expireShare(pool, data.ref_id, new Date(data.due_at));
      return { ...result };
    },
  });
}
