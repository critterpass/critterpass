/**
 * `la.lifecycle` (every minute): the clock's side of Live Activities.
 * - Starts that are due: leave-bys three hours out, flights in their window, meet-ups of boosted
 *   (or requested) trips half an hour out, polls closing within a day.
 * - Every live object re-runs, so time-driven frames move on (soon, leave time, orange boarding,
 *   landed, late) and planned ends happen; an unchanged frame sends nothing.
 * - The 8-hour restart: ActivityKit ends an activity after eight hours active, so a little before
 *   that the server ends it on that phone and starts a fresh one with the same content version.
 *   A kind whose kill switch is off never restarts (its orchestrator run ends what is left).
 * - Bookkeeping: past their stale date rows read `stale`; ended rows go after seven days.
 */
import { sendInTx, withSystem } from '@cp/db';
import {
  LA_ACTIVE_LIMIT_MS,
  LA_KIND_SPECS,
  LA_LEAVE_BY_LEAD_MS,
  LA_MEET_UP_LEAD_MS,
  LA_MEET_UP_TAIL_MS,
  LA_QUEUES,
  LA_RESTART_MARGIN_MS,
  LA_RIDE_TTL_MS,
  LA_VOTE_LEAD_MS,
  laOrchestrateSingletonKey,
  type LaKind,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { deliverAll, type LaTransports } from './deliver';
import { endSends, type LaActivityRow } from './rows';

export const LA_RETENTION_MS = 7 * 86_400_000;

interface Due {
  kind: LaKind;
  ref_id: string;
}

async function dueObjects(tx: pg.PoolClient, now: Date): Promise<Due[]> {
  const { rows } = await tx.query<Due>(
    `SELECT 'leave_by' AS kind, id AS ref_id FROM leave_bys
      WHERE state <> 'cancelled' AND leave_at BETWEEN $1::timestamptz - interval '3 hours'
                                               AND $1::timestamptz + make_interval(secs => $2 / 1000.0)
     UNION ALL
     SELECT 'flight', s.id FROM flight_segments s
      WHERE s.status <> 'cancelled'
        AND coalesce(s.est_dep_at, s.sched_dep_at) <= $1::timestamptz + interval '3 hours'
        AND coalesce(s.act_arr_at, s.est_arr_at, s.sched_arr_at,
                     coalesce(s.est_dep_at, s.sched_dep_at) + interval '12 hours')
            >= $1::timestamptz - interval '2 hours'
     UNION ALL
     SELECT 'meet_up', m.id FROM meetups m
       JOIN trip_entitlements e ON e.trip_id = m.trip_id AND e.boost_active
      WHERE m.status = 'active'
        AND m.meet_at BETWEEN $1::timestamptz - make_interval(secs => $4 / 1000.0)
                          AND $1::timestamptz + make_interval(secs => $3 / 1000.0)
     UNION ALL
     SELECT 'vote', id FROM polls
      WHERE status = 'open' AND closes_at BETWEEN $1 AND $1::timestamptz + make_interval(secs => $5 / 1000.0)
     UNION
     SELECT kind, ref_id FROM la_object_states WHERE phase = 'live'`,
    [now, LA_LEAVE_BY_LEAD_MS, LA_MEET_UP_LEAD_MS, LA_MEET_UP_TAIL_MS, LA_VOTE_LEAD_MS],
  );
  return rows;
}

async function restartDue(
  tx: pg.PoolClient,
  now: Date,
  kinds: readonly LaKind[],
): Promise<LaActivityRow[]> {
  const { rows } = await tx.query<LaActivityRow>(
    `UPDATE device_activities a
        SET state = 'ended', ended_at = $1, end_reason = 'restart'
       FROM devices d
      WHERE d.id = a.device_id AND a.state IN ('active', 'stale') AND a.kind <> 'alarm'
        AND a.started_at < $1::timestamptz - make_interval(secs => $2 / 1000.0)
        AND a.kind = ANY($3::text[])
      RETURNING a.id, a.device_id, a.user_id, a.kind, a.ref_id, a.activity_push_token, a.token_env,
                a.broadcast_channel_id, NULL::text AS apns_channel_id, NULL::text AS channel_env,
                NULL::text AS channel_bundle_id, d.bundle_id, d.platform,
                NULL::text AS fcm_token`,
    [now, LA_ACTIVE_LIMIT_MS - LA_RESTART_MARGIN_MS, kinds],
  );
  return rows;
}

export interface LifecycleResult {
  readonly queued: number;
  readonly restarted: number;
  readonly staled: number;
  readonly purged: number;
}

export interface LaLifecycleDeps extends LaTransports {
  readonly switches: { isOn(key: string): Promise<boolean> };
}

async function enabledKinds(deps: LaLifecycleDeps): Promise<LaKind[]> {
  const kinds = Object.keys(LA_KIND_SPECS) as LaKind[];
  const on = await Promise.all(kinds.map((kind) => deps.switches.isOn(`la.${kind}.enabled`)));
  return kinds.filter((_, i) => on[i] === true);
}

export async function runLifecycle(
  pool: pg.Pool,
  deps: LaLifecycleDeps,
  now = new Date(),
): Promise<LifecycleResult> {
  const kinds = await enabledKinds(deps);
  const result = await withSystem(pool, async (tx) => {
    const restarted = await restartDue(tx, now, kinds);
    const frames = new Map<string, Record<string, unknown>>();
    for (const row of restarted) {
      const { rows } = await tx.query<{ last_state: Record<string, unknown> | null }>(
        'SELECT last_state FROM la_object_states WHERE kind = $1 AND ref_id = $2',
        [row.kind, row.ref_id],
      );
      const last = rows[0]?.last_state;
      if (last !== null && last !== undefined) frames.set(row.id, last);
    }
    const stale = await tx.query(
      `UPDATE device_activities SET state = 'stale'
        WHERE state = 'active' AND stale_at IS NOT NULL AND stale_at < $1`,
      [now],
    );
    await tx.query(
      `UPDATE device_activities SET state = 'ended', ended_at = $1, end_reason = 'expired'
        WHERE kind = 'ride' AND state IN ('pending', 'active', 'stale')
          AND started_at < $1::timestamptz - make_interval(secs => $2 / 1000.0)`,
      [now, LA_RIDE_TTL_MS],
    );
    const purge = await tx.query(
      `DELETE FROM device_activities
        WHERE state IN ('ended', 'dismissed')
          AND ended_at < $1::timestamptz - make_interval(secs => $2 / 1000.0)`,
      [now, LA_RETENTION_MS],
    );
    await tx.query(
      `DELETE FROM la_object_states
        WHERE phase = 'ended' AND ended_at < $1::timestamptz - make_interval(secs => $2 / 1000.0)`,
      [now, LA_RETENTION_MS],
    );
    const due = await dueObjects(tx, now);
    const seen = new Set<string>();
    for (const row of [...due, ...restarted]) {
      const job = { kind: row.kind, ref_id: row.ref_id };
      const key = laOrchestrateSingletonKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      await sendInTx(tx, LA_QUEUES.orchestrate, job, { singletonKey: key });
    }
    return {
      queued: seen.size,
      restarted,
      frames,
      staled: stale.rowCount ?? 0,
      purged: purge.rowCount ?? 0,
    };
  });
  // The replaced activity leaves this phone only (never through the shared channel), showing
  // the frame it had.
  const ends = result.restarted.flatMap((row) => {
    const frame = result.frames.get(row.id);
    return frame === undefined || row.activity_push_token === null
      ? []
      : endSends([row], frame, now, 0);
  });
  if (ends.length > 0) await deliverAll(deps, new Map(), ends);
  return {
    queued: result.queued,
    restarted: result.restarted.length,
    staled: result.staled,
    purged: result.purged,
  };
}

export function laLifecycleJob(deps: LaLifecycleDeps): AnyJobDefinition {
  return defineJob({
    queue: LA_QUEUES.lifecycle,
    schema: z.object({}).nullish(),
    async handler(_data, ctx) {
      return { ...(await runLifecycle(ctx.pool, deps)) };
    },
  });
}
