/**
 * The demo trip's plan and one guide change the caller can still undo: Tokek moved the airport
 * pickup because a flight moved. The change is a real ChangeSet applied by
 * `app.apply_change_set` with its inverse stored on the guide action, so UNDO from the inbox runs
 * the real `undo_guide_action`. A reseed reuses a change that is still undoable for another hour,
 * otherwise it moves the same pickup again (to 10:40, or back to 10:00), so plans never pile up.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { DemoWorld } from './demo-world';

const PICKUP_NOTES = 'Airport pickup, Ngurah Rai arrivals';
const BASE_TIME = '10:00';
const MOVED_TIME = '10:40';
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A change closer than this to the end of its undo window is replaced on reseed. */
const REUSE_MARGIN_MS = 60 * 60 * 1000;

export interface DemoGuideAction {
  readonly actionId: string;
  readonly summary: string;
  readonly undoUntil: Date;
}

async function one<T>(tx: pg.PoolClient, sql: string, values: unknown[]): Promise<T> {
  const { rows } = await tx.query<T & pg.QueryResultRow>(sql, values);
  const row = rows[0];
  if (row === undefined) throw new Error('demo seed: expected a row back');
  return row;
}

interface Pickup {
  readonly stableId: string;
  readonly startsAt: string;
  readonly localTime: string;
}

async function currentPickup(tx: pg.PoolClient, tripId: string): Promise<Pickup | undefined> {
  const { rows } = await tx.query<{ stable_id: string; starts_at: string; local_time: string }>(
    `SELECT pi.stable_id, to_jsonb(pi) ->> 'starts_at' AS starts_at,
            to_char(pi.starts_at AT TIME ZONE t.tz, 'HH24:MI') AS local_time
       FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
      WHERE t.id = $1 AND pi.category = 'transfer' AND pi.notes = $2
      LIMIT 1`,
    [tripId, PICKUP_NOTES],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : { stableId: row.stable_id, startsAt: row.starts_at, localTime: row.local_time };
}

/** The first day's plan with the pickup, created once per trip. */
async function ensurePickup(tx: pg.PoolClient, world: DemoWorld, uid: string): Promise<Pickup> {
  const found = await currentPickup(tx, world.tripId);
  if (found !== undefined) return found;
  const version = await one<{ id: string }>(
    tx,
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [world.tripId],
  );
  const day = await one<{ id: string }>(
    tx,
    `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme)
     SELECT $1, id, 1, start_date, 'Arrival and the villa pool' FROM trips WHERE id = $2
     RETURNING id`,
    [version.id, world.tripId],
  );
  await tx.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, tz, category,
       attendee_ids, notes)
     SELECT $1, $2, t.id, $3, (t.start_date + $4::time) AT TIME ZONE t.tz, t.tz, 'transfer',
            ARRAY[$5::uuid], $6
       FROM trips t WHERE t.id = $7`,
    [version.id, day.id, randomUUID(), BASE_TIME, uid, PICKUP_NOTES, world.tripId],
  );
  await tx.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
    version.id,
    world.tripId,
  ]);
  const created = await currentPickup(tx, world.tripId);
  if (created === undefined) throw new Error('demo seed: the pickup was not planned');
  return created;
}

async function reusableAction(
  tx: pg.PoolClient,
  tripId: string,
  now: Date,
): Promise<DemoGuideAction | undefined> {
  const { rows } = await tx.query<{ id: string; summary: string; undo_until: Date }>(
    `SELECT ga.id, ga.audit ->> 'summary' AS summary, ga.undo_until
       FROM guide_actions ga
      WHERE ga.trip_id = $1 AND ga.status = 'done' AND ga.reversible AND ga.compensates_id IS NULL
        AND ga.undo_until > $2
        AND NOT EXISTS (SELECT 1 FROM guide_actions u WHERE u.compensates_id = ga.id)
      ORDER BY ga.created_at DESC LIMIT 1`,
    [tripId, new Date(now.getTime() + REUSE_MARGIN_MS)],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : { actionId: row.id, summary: row.summary, undoUntil: row.undo_until };
}

/** Moves the pickup through a real ChangeSet, the way the guide's executor applies one. */
async function moveOnce(
  tx: pg.PoolClient,
  world: DemoWorld,
  uid: string,
  pickup: Pickup,
  now: Date,
): Promise<DemoGuideAction> {
  const to = pickup.localTime === BASE_TIME ? MOVED_TIME : BASE_TIME;
  const target = await one<{ at: string }>(
    tx,
    `SELECT to_jsonb(((t.start_date + $2::time) AT TIME ZONE t.tz)) #>> '{}' AS at
       FROM trips t WHERE t.id = $1`,
    [world.tripId, to],
  );
  const before = { starts_at: pickup.startsAt, notes: PICKUP_NOTES };
  const after = { starts_at: target.at, notes: PICKUP_NOTES };
  const reason = 'flight moved';
  const op = { target: pickup.stableId, affected_user_ids: [uid], booking_impact: false };
  const ops = [{ op: 'retime', ...op, before, after, reason }];
  const inverse = {
    type: 'change_set_ops',
    ops: [{ op: 'retime', ...op, before: after, after: before, reason: `undo: ${reason}` }],
  };
  const summary = `moved your airport pickup to ${to}`;
  const changeSet = await one<{ id: string }>(
    tx,
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, status, ops)
     SELECT id, current_version_id, 'delay', 'guide', $2, 'draft', $3 FROM trips WHERE id = $1
     RETURNING id`,
    [world.tripId, world.guideId, JSON.stringify(ops)],
  );
  await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSet.id]);
  const audit = { affected_user_ids: [uid], decider: { outcome: 'auto' }, summary };
  const action = await one<{ id: string }>(
    tx,
    `INSERT INTO guide_actions (trip_id, change_set_id, kind, status, reversible, inverse, audit)
     VALUES ($1, $2, 'reschedule_pickup', 'planned', true, $3, $4) RETURNING id`,
    [world.tripId, changeSet.id, JSON.stringify(inverse), JSON.stringify(audit)],
  );
  await tx.query("UPDATE guide_actions SET status = 'running' WHERE id = $1", [action.id]);
  await tx.query(
    "UPDATE change_sets SET status = 'approved', approved_by_kind = 'policy' WHERE id = $1",
    [changeSet.id],
  );
  await tx.query('SELECT app.apply_change_set($1)', [changeSet.id]);
  const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);
  await tx.query("UPDATE guide_actions SET status = 'done', undo_until = $2 WHERE id = $1", [
    action.id,
    undoUntil,
  ]);
  return { actionId: action.id, summary, undoUntil };
}

/** A guide change on the demo trip the caller can undo for most of a day. */
export async function ensureUndoableGuideAction(
  tx: pg.PoolClient,
  world: DemoWorld,
  uid: string,
  now: Date,
): Promise<DemoGuideAction> {
  const pickup = await ensurePickup(tx, world, uid);
  return (await reusableAction(tx, world.tripId, now)) ?? moveOnce(tx, world, uid, pickup, now);
}
