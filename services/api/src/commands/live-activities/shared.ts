/**
 * What the Live Activity commands share: the caller's own device (a token or an activity report
 * for someone else's install is refused), the trip an activity's object belongs to, and the hook
 * that queues the orchestrator for every event the api appends that moves an activity.
 */
import { sendInTx } from '@cp/db';
import {
  DomainError,
  LA_BOOST_EVENTS,
  LA_EVENT_TARGETS,
  LA_QUEUES,
  laOrchestrateSingletonKey,
  type LaKind,
  type LaOrchestrateJob,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** The install must be registered to the caller: `NOT_FOUND` if unknown, `FORBIDDEN` if not theirs. */
export async function requireOwnDevice(
  tx: pg.PoolClient,
  deviceId: string,
  uid: string,
): Promise<{ platform: 'ios' | 'android' }> {
  const { rows } = await tx.query<{ user_id: string; platform: 'ios' | 'android' }>(
    'SELECT user_id, platform FROM devices WHERE id = $1',
    [deviceId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'device_not_registered' });
  if (row.user_id !== uid) throw new DomainError('FORBIDDEN', { reason: 'foreign_device' });
  return { platform: row.platform };
}

/** The trip an activity's object belongs to (null for objects without one). */
export async function tripOfObject(
  tx: pg.PoolClient,
  kind: LaKind,
  refId: string,
): Promise<string | null> {
  const table: Partial<Record<LaKind, string>> = {
    leave_by: 'leave_bys',
    meet_up: 'meetups',
    flight: 'flight_segments',
    vote: 'polls',
    ride: 'ride_quotes',
    alarm: 'leave_bys',
  };
  const name = table[kind];
  if (name === undefined) return null;
  const { rows } = await tx.query<{ trip_id: string | null }>(
    `SELECT trip_id FROM ${name} WHERE id = $1`,
    [refId],
  );
  return rows[0]?.trip_id ?? null;
}

async function enqueue(tx: pg.PoolClient, job: LaOrchestrateJob): Promise<void> {
  await sendInTx(tx, LA_QUEUES.orchestrate, job, { singletonKey: laOrchestrateSingletonKey(job) });
}

/**
 * `onEventAppended` hook: queues `la.orchestrate` for the object an event moves, in the same
 * transaction, so a rolled-back command never touches a lock screen. A boost change re-runs the
 * trip's live meet-up activities (the lifecycle sweep starts new ones within a minute).
 */
export async function enqueueLaOrchestrate(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const target = LA_EVENT_TARGETS[event.type];
  const boost = LA_BOOST_EVENTS.has(event.type) && event.tripId !== null;
  if (target === undefined && !boost) return;
  const jobs = await asSystemRole(tx, async (): Promise<LaOrchestrateJob[]> => {
    if (target !== undefined) {
      const { rows } = await tx.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM app.domain_event_for_routing($1)',
        [event.id],
      );
      const hit = rows[0] === undefined ? null : target(rows[0].payload);
      return hit === null ? [] : [{ kind: hit.kind, ref_id: hit.refId }];
    }
    const { rows } = await tx.query<{ ref_id: string }>(
      `SELECT ref_id FROM la_object_states
        WHERE kind = 'meet_up' AND trip_id = $1 AND phase = 'live'`,
      [event.tripId],
    );
    return rows.map((row) => ({ kind: 'meet_up', ref_id: row.ref_id }));
  });
  for (const job of jobs) await enqueue(tx, job);
}
