/**
 * `eta.running_late` (every minute): the upkeep of running-late journeys.
 * - A journey whose checks stopped for three minutes (the phone lost signal, the app was closed)
 *   is marked stale: 3k-9 shows its ETA as the last one known, not as live.
 * - A running-late disruption whose item is over resolves; nothing about it can change any more.
 * - A journey check is kept for a day, then deleted.
 * The phone drives the checks; this job never routes and never knows where anyone is.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  DISRUPTION_QUEUES,
  JOURNEY_CHECK_TTL_HOURS,
  JOURNEY_STALE_MIN,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

export interface JourneySweep {
  readonly stale: number;
  readonly resolved: number;
  readonly deleted: number;
}

const DEFAULT_LENGTH = "interval '60 minutes'";

export async function sweepJourneys(pool: pg.Pool, now: Date = new Date()): Promise<JourneySweep> {
  return withSystem(pool, async (tx) => {
    const stale = await tx.query<{ id: string; trip_id: string }>(
      `UPDATE disruptions d SET facts = d.facts || '{"stale": "yes"}'::jsonb
        WHERE d.kind = 'running_late' AND d.status = 'open' AND NOT d.facts ? 'stale'
          AND EXISTS (SELECT 1 FROM journey_checks c WHERE c.disruption_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM journey_checks c
                           WHERE c.disruption_id = d.id
                             AND c.checked_at > $1::timestamptz - make_interval(mins => $2))
        RETURNING d.id, d.trip_id`,
      [now, JOURNEY_STALE_MIN],
    );
    for (const journey of stale.rows) {
      await outbox(tx, channelName('trip_watch', journey.trip_id), 'late.eta', {
        disruption_id: journey.id,
        stale: true,
      });
    }
    const over = await tx.query<{ id: string; trip_id: string; crew_id: string }>(
      `UPDATE disruptions d SET status = 'resolved', resolved_at = $1, version = d.version + 1
         FROM trips t
        WHERE t.id = d.trip_id AND d.kind = 'running_late' AND d.status = 'open'
          AND NOT EXISTS (
                SELECT 1 FROM plan_items pi
                 WHERE pi.version_id = t.current_version_id
                   AND pi.stable_id = (d.affected -> 'item_stable_ids' ->> 0)::uuid
                   AND coalesce(pi.ends_at, pi.starts_at + ${DEFAULT_LENGTH}) > $1::timestamptz)
        RETURNING d.id, d.trip_id, t.crew_id`,
      [now],
    );
    for (const done of over.rows) {
      await appendDomainEvent(tx, {
        type: 'disruption.resolved',
        aggregateKind: 'trip',
        aggregateId: done.trip_id,
        actorKind: 'system',
        actorId: null,
        crewId: done.crew_id,
        tripId: done.trip_id,
        payload: { trip_id: done.trip_id, disruption_id: done.id, status: 'resolved' },
      });
      await outbox(tx, channelName('trip_watch', done.trip_id), 'disruption.step', {
        disruption_id: done.id,
        action_id: 'late_party',
        state: 'resolved',
      });
    }
    const deleted = await tx.query(
      `DELETE FROM journey_checks
        WHERE checked_at < $1::timestamptz - make_interval(hours => $2)`,
      [now, JOURNEY_CHECK_TTL_HOURS],
    );
    return {
      stale: stale.rowCount ?? 0,
      resolved: over.rowCount ?? 0,
      deleted: deleted.rowCount ?? 0,
    };
  });
}

export function journeyStaleJob(): JobDefinition<Record<string, never> | null | undefined> {
  return defineJob({
    queue: DISRUPTION_QUEUES.runningLate,
    schema: z.object({}).nullish(),
    handler: async (_data, ctx) => ({ ...(await sweepJourneys(ctx.pool)) }),
  });
}
