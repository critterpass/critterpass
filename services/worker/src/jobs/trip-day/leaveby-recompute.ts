/**
 * `leaveby.recompute` (docs/api-contracts-async.md §2.3): after a plan or flight change, or when
 * someone takes a seat on a trip that is already locked in, every
 * upcoming item on the trip's current plan that needs a leave-by (an early start, a transfer or
 * flight, or a long trip there) gets one, computed from the route (Mapbox traffic when configured,
 * flagged as an estimate otherwise), its pickup when a transfer booking collects the crew, and its
 * buffer. A leave-by that moved re-arms its timers and tells the crew once; one that no longer has
 * an item is cancelled. Running it again with nothing changed changes nothing.
 */
import { appendDomainEvent, cancelScheduledEvent, outbox, scheduleEvent, withSystem } from '@cp/db';
import {
  channelName,
  DEFAULT_ALARM_POLICY,
  LEAVE_BY_SLOTS,
  leaveByRecomputeJobSchema,
  TRIP_DAY_QUEUES,
  type LeaveByLeg,
  type LeaveByRecomputeJob,
  type LeaveByState,
  type RouteEtaProvider,
} from '@cp/domain';
import {
  arriveEarlyMinutes,
  computeLeaveBy,
  isLeaveByEligible,
  leaveByTimers,
  stateByClock,
} from '@cp/planner';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { armTripBriefings } from './briefing-schedule';
import { armDayBundles } from './daybundle-triggers';
import { loadPlanItems, type PlanItemRow } from './plan-items';

const MINUTE = 60_000;

interface ExistingLeaveBy {
  id: string;
  plan_item_stable_id: string;
  leave_at: Date;
  buffer_min: number;
  state: LeaveByState;
  version: number;
}

async function travelFor(
  router: RouteEtaProvider,
  item: PlanItemRow,
  arriveEarly: number,
): Promise<LeaveByLeg> {
  if (item.pickup_at !== null) {
    return {
      kind: 'pickup',
      minutes: 0,
      distance_m: null,
      mode: null,
      source: 'pickup',
      traffic: false,
      estimate: false,
    };
  }
  if (item.origin === null || item.lat === null || item.lng === null) {
    return {
      kind: 'none',
      minutes: 0,
      distance_m: null,
      mode: null,
      source: 'none',
      traffic: false,
      estimate: true,
    };
  }
  const eta = await router.eta({
    originLat: item.origin.lat,
    originLng: item.origin.lng,
    destLat: item.lat,
    destLng: item.lng,
    mode: 'auto',
    // A first guess of when the crew sets off, so predicted traffic is for the right hour.
    departAt: new Date(item.starts_at.getTime() - (arriveEarly + 60) * MINUTE),
  });
  return {
    kind: 'route',
    minutes: eta.minutes,
    distance_m: eta.distanceM,
    mode: eta.mode,
    source: eta.source,
    traffic: eta.traffic,
    estimate: eta.estimate,
  };
}

async function armTimers(
  tx: pg.PoolClient,
  leaveById: string,
  leaveAt: Date,
  tz: string,
  now: Date,
): Promise<void> {
  const timers = leaveByTimers(leaveAt, now, DEFAULT_ALARM_POLICY.lead_min);
  const armed = new Set(timers.map((timer) => timer.slot));
  for (const timer of timers) {
    await scheduleEvent(tx, {
      kind: TRIP_DAY_QUEUES.leaveBySchedule,
      refId: leaveById,
      slot: timer.slot,
      tz,
      at: timer.at,
    });
  }
  for (const slot of LEAVE_BY_SLOTS) {
    if (!armed.has(slot)) {
      await cancelScheduledEvent(tx, {
        kind: TRIP_DAY_QUEUES.leaveBySchedule,
        refId: leaveById,
        slot,
      });
    }
  }
}

/** Tells the crew a leave-by moved: the domain event and the `trip_dayof:` hint. */
export async function announceLeaveBy(
  tx: pg.PoolClient,
  tripId: string,
  leaveById: string,
  leaveAt: Date,
  state: LeaveByState,
): Promise<void> {
  const payload = {
    trip_id: tripId,
    leave_by_id: leaveById,
    leave_at: leaveAt.toISOString(),
    state,
  };
  await appendDomainEvent(tx, {
    type: 'leave_by.changed',
    aggregateKind: 'leave_by',
    aggregateId: leaveById,
    actorKind: 'system',
    actorId: null,
    tripId,
    payload,
  });
  await outbox(tx, channelName('trip_dayof', tripId), 'leave_by.changed', payload);
}

/** Every member the item is for has a readiness row (asleep until they say otherwise). */
async function ensureReadiness(
  tx: pg.PoolClient,
  leaveById: string,
  tripId: string,
  participantIds: readonly string[],
): Promise<void> {
  await tx.query(
    `INSERT INTO readiness (leave_by_id, trip_id, user_id)
     SELECT $1, $2, uid FROM unnest($3::uuid[]) AS uid
     ON CONFLICT (leave_by_id, user_id) DO NOTHING`,
    [leaveById, tripId, participantIds],
  );
}

async function upsert(
  tx: pg.PoolClient,
  tripId: string,
  item: PlanItemRow,
  leg: LeaveByLeg,
  existing: ExistingLeaveBy | undefined,
  now: Date,
): Promise<boolean> {
  const early = arriveEarlyMinutes(item.category);
  const computed = computeLeaveBy({
    startsAt: item.starts_at,
    pickupAt: item.pickup_at,
    travelMinutes: leg.minutes,
    bufferMin: existing?.buffer_min ?? 10,
    arriveEarlyMin: early,
    tz: item.tz,
  });
  const state = stateByClock(now, computed.leaveAt, DEFAULT_ALARM_POLICY.lead_min);
  if (
    existing !== undefined &&
    existing.state !== 'cancelled' &&
    existing.leave_at.getTime() === computed.leaveAt.getTime()
  ) {
    // Who the item is for can change while its time stands (someone got on the trip after the
    // leave-by was made). One that has not fired yet takes the new list and their readiness row,
    // quietly: nothing moved, so nobody is told. One that already fired keeps who it knocked.
    const open = existing.leave_at.getTime() > now.getTime();
    await tx.query(
      `UPDATE leave_bys SET plan_item_id = $2, legs = $3,
              participant_ids = CASE WHEN $5 THEN $4::uuid[] ELSE participant_ids END
        WHERE id = $1`,
      [existing.id, item.id, JSON.stringify([leg]), item.participant_ids, open],
    );
    if (open) await ensureReadiness(tx, existing.id, tripId, item.participant_ids);
    return false;
  }
  const pickup =
    item.pickup_at === null
      ? null
      : { at: item.pickup_at.toISOString(), place: item.pickup_place, booking_id: item.booking_id };
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, title, place_name, local_date,
       starts_at, leave_at, pickup_at, tz, legs, pickup, participant_ids, state, alarm_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (trip_id, plan_item_stable_id) DO UPDATE SET
       plan_item_id = EXCLUDED.plan_item_id, title = EXCLUDED.title,
       place_name = EXCLUDED.place_name, local_date = EXCLUDED.local_date,
       starts_at = EXCLUDED.starts_at, leave_at = EXCLUDED.leave_at,
       pickup_at = EXCLUDED.pickup_at, tz = EXCLUDED.tz, legs = EXCLUDED.legs,
       pickup = EXCLUDED.pickup, participant_ids = EXCLUDED.participant_ids,
       state = EXCLUDED.state, version = leave_bys.version + 1, computed_at = now()
     RETURNING id`,
    [
      tripId,
      item.id,
      item.stable_id,
      item.title,
      item.place_name,
      computed.localDate,
      item.starts_at,
      computed.leaveAt,
      item.pickup_at,
      item.tz,
      JSON.stringify([leg]),
      pickup === null ? null : JSON.stringify(pickup),
      item.participant_ids,
      state,
      JSON.stringify(DEFAULT_ALARM_POLICY),
    ],
  );
  const leaveById = rows[0]?.id;
  if (leaveById === undefined) throw new Error('leave_bys upsert returned no row');
  await ensureReadiness(tx, leaveById, tripId, item.participant_ids);
  await armTimers(tx, leaveById, computed.leaveAt, item.tz, now);
  await announceLeaveBy(tx, tripId, leaveById, computed.leaveAt, state);
  return true;
}

export interface RecomputeResult {
  readonly changed: number;
  readonly cancelled: number;
}

/** Brings one trip's leave-bys in line with its current plan. */
export async function recomputeLeaveBys(
  pool: pg.Pool,
  tripId: string,
  router: RouteEtaProvider,
  now: Date = new Date(),
): Promise<RecomputeResult> {
  const items = await withSystem(pool, (tx) => loadPlanItems(tx, tripId, now));
  // Routing runs outside any transaction; storing is one short transaction.
  const eligible: { item: PlanItemRow; leg: LeaveByLeg }[] = [];
  for (const item of items) {
    const leg = await travelFor(router, item, arriveEarlyMinutes(item.category));
    const travel = leg.kind === 'route' ? leg.minutes : null;
    if (isLeaveByEligible({ ...item, startsAt: item.starts_at }, travel)) {
      eligible.push({ item, leg });
    }
  }
  return withSystem(pool, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`leave_bys:${tripId}`]);
    const { rows } = await tx.query<ExistingLeaveBy>(
      `SELECT id, plan_item_stable_id, leave_at, buffer_min, state, version FROM leave_bys
        WHERE trip_id = $1`,
      [tripId],
    );
    const byStable = new Map(rows.map((row) => [row.plan_item_stable_id, row]));
    let changed = 0;
    for (const { item, leg } of eligible) {
      if (await upsert(tx, tripId, item, leg, byStable.get(item.stable_id), now)) changed += 1;
    }
    const keep = new Set(eligible.map(({ item }) => item.stable_id));
    let cancelled = 0;
    for (const row of rows) {
      if (keep.has(row.plan_item_stable_id)) continue;
      if (row.state === 'cancelled' || row.state === 'departed') continue;
      if (row.leave_at.getTime() <= now.getTime()) continue;
      await tx.query(
        "UPDATE leave_bys SET state = 'cancelled', version = version + 1 WHERE id = $1",
        [row.id],
      );
      for (const slot of LEAVE_BY_SLOTS) {
        await cancelScheduledEvent(tx, {
          kind: TRIP_DAY_QUEUES.leaveBySchedule,
          refId: row.id,
          slot,
        });
      }
      await announceLeaveBy(tx, tripId, row.id, row.leave_at, 'cancelled');
      cancelled += 1;
    }
    return { changed, cancelled };
  });
}

export interface TripDayRefresh extends RecomputeResult {
  readonly briefings: number;
  readonly bundles: number;
}

/**
 * One run of the job: the leave-bys, then each going member's next morning and the day bundles,
 * which the same plan, trip and roster changes move.
 */
export async function refreshTripDay(
  pool: pg.Pool,
  tripId: string,
  router: RouteEtaProvider,
  now: Date = new Date(),
): Promise<TripDayRefresh> {
  const result = await recomputeLeaveBys(pool, tripId, router, now);
  const armed = await withSystem(pool, async (tx) => ({
    briefings: await armTripBriefings(tx, tripId, now),
    bundles: await armDayBundles(tx, tripId, now),
  }));
  return { ...result, ...armed };
}

export function leaveByRecomputeJob(router: RouteEtaProvider): JobDefinition<LeaveByRecomputeJob> {
  return defineJob({
    queue: TRIP_DAY_QUEUES.leaveByRecompute,
    schema: leaveByRecomputeJobSchema,
    singletonKey: (data: LeaveByRecomputeJob) => data.trip_id,
    handler: async (data, ctx) => ({
      ...(await refreshTripDay(ctx.pool, data.trip_id, router)),
    }),
  });
}
