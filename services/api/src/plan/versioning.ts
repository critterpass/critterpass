/**
 * Group plan versions (docs/system-architecture.md §7.b). Every group edit, whether an organiser's
 * direct ops or an approved change set, runs through `commitPlanVersion`: under the trip row lock
 * (so edits on one trip are serialised) it checks the edit was made against the trip's current
 * version, replays the edits on that version, writes the result as a new current version (the old
 * one superseded) and tells the crew. A stale base answers `PLAN_VERSION_CONFLICT{latest}`; the
 * client rebases (packages/planner rebase) and retries once. Writes run as `app_system`: plan rows
 * have no `app_user` write path at all.
 */
import { appendDomainEvent, outbox, sendInTx } from '@cp/db';
import {
  applyPlanEdits,
  channelName,
  DomainError,
  PLAN_QUEUES,
  PLAN_RT,
  PlanEditError,
  type CustomPlace,
  type PlanEdit,
  type PlanOp,
  type PlanOpsHint,
  type PlanPush,
  type PlanState,
  type PlanStateDay,
  type PlanStateItem,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { writePushes } from './pushes';

const COST_RECOMPUTE_QUEUE = 'cost.recompute';

/** Plan hints stay well under the 8 KB envelope; larger batches arrive through sync alone. */
const MAX_HINT_OPS_BYTES = 6 * 1024;

interface ItemRow {
  stable_id: string;
  day_no: number;
  starts_at: Date | null;
  ends_at: Date | null;
  tz: string | null;
  lane: string | null;
  attendee_ids: string[] | null;
  poi_id: string | null;
  custom_place: CustomPlace | null;
  provider_id: string | null;
  booking_id: string | null;
  must_do_id: string | null;
  category: string | null;
  cost_model: NonNullable<PlanStateItem['cost_model']> | null;
  amount_minor: string | null;
  currency: string | null;
  status: NonNullable<PlanStateItem['status']>;
  flexibility: string | null;
  is_outdoor: boolean;
  created_by_kind: 'user' | 'guide';
  notes: string | null;
  locked_reason: NonNullable<PlanStateItem['locked_reason']> | null;
}

function toStateItem(row: ItemRow): PlanStateItem {
  const optional = {
    starts_at: row.starts_at?.toISOString(),
    ends_at: row.ends_at?.toISOString(),
    tz: row.tz ?? undefined,
    attendee_ids: row.attendee_ids ?? undefined,
    category: row.category ?? undefined,
    cost_model: row.cost_model ?? undefined,
    amount_minor: row.amount_minor === null ? undefined : Number(row.amount_minor),
    currency: row.currency ?? undefined,
  };
  return {
    ...(Object.fromEntries(
      Object.entries(optional).filter(([, v]) => v !== undefined),
    ) as Partial<PlanStateItem>),
    stable_id: row.stable_id,
    day_no: row.day_no,
    lane: row.lane,
    poi_id: row.poi_id,
    custom_place: row.custom_place,
    provider_id: row.provider_id,
    booking_id: row.booking_id,
    must_do_id: row.must_do_id,
    status: row.status,
    flexibility: row.flexibility,
    is_outdoor: row.is_outdoor,
    created_by_kind: row.created_by_kind,
    notes: row.notes,
    locked_reason: row.locked_reason,
  };
}

interface DayRow {
  readonly day_no: number;
  readonly date: string | null;
  readonly theme: string | null;
  readonly destination_id: string | null;
}

/** A day of the pure state; a day with no area of its own carries no area key, as before. */
export function toStateDay({ destination_id, ...day }: DayRow): PlanStateDay {
  return destination_id === null ? day : { ...day, destination_id };
}

/** A version's days and items as the pure plan state (read as the system: callers checked access). */
export async function loadPlanState(tx: pg.PoolClient, versionId: string): Promise<PlanState> {
  return asSystemRole(tx, async () => {
    const days = await tx.query<DayRow>(
      `SELECT day_no, to_char(date, 'YYYY-MM-DD') AS date, theme, destination_id FROM plan_days
        WHERE version_id = $1 ORDER BY day_no`,
      [versionId],
    );
    const items = await tx.query<ItemRow>(
      `SELECT i.stable_id, d.day_no, i.starts_at, i.ends_at, i.tz, i.lane, i.attendee_ids, i.poi_id,
              i.custom_place, i.provider_id, i.booking_id, i.must_do_id, i.category, i.cost_model, i.amount_minor,
              i.currency, i.status, i.flexibility, i.is_outdoor, i.created_by_kind, i.notes,
              i.locked_reason
         FROM plan_items i JOIN plan_days d ON d.id = i.day_id
        WHERE i.version_id = $1
        ORDER BY d.day_no, i.starts_at NULLS LAST, i.stable_id`,
      [versionId],
    );
    return { days: days.rows.map(toStateDay), items: items.rows.map(toStateItem) };
  });
}

export interface TripPlanHead {
  readonly tripId: string;
  readonly crewId: string;
  readonly currentVersionId: string | null;
}

/** Locks the trip row (serialising plan edits on it) and reads its current version. */
export async function lockTripPlan(tx: pg.PoolClient, tripId: string): Promise<TripPlanHead> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ crew_id: string; current_version_id: string | null }>(
      'SELECT crew_id, current_version_id FROM trips WHERE id = $1 FOR UPDATE',
      [tripId],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    return { tripId, crewId: row.crew_id, currentVersionId: row.current_version_id };
  });
}

/** Throws `PLAN_VERSION_CONFLICT{latest}` unless `baseVersionId` is the trip's current version. */
export function assertCurrentBase(head: TripPlanHead, baseVersionId: string): string {
  if (head.currentVersionId === null) {
    throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
  }
  if (head.currentVersionId !== baseVersionId) {
    throw new DomainError('PLAN_VERSION_CONFLICT', { latest: head.currentVersionId });
  }
  return head.currentVersionId;
}

/** Replays edits, mapping a rejected edit to `VALIDATION` with its reason and target. */
export function replay(state: PlanState, edits: readonly PlanEdit[]): PlanState {
  try {
    return applyPlanEdits(state, edits);
  } catch (error) {
    if (error instanceof PlanEditError) {
      throw new DomainError('VALIDATION', { reason: error.reason, target: error.target });
    }
    throw error;
  }
}

export interface CommitInput {
  readonly head: TripPlanHead;
  readonly baseVersionId: string;
  readonly next: PlanState;
  readonly actor: { readonly kind: 'user' | 'system'; readonly id: string | null };
  readonly source: PlanOpsHint['source'];
  readonly opCount: number;
  /** The plan ops for the realtime hint (null: the crew waits for sync). */
  readonly ops: readonly PlanOp[] | null;
  readonly changeSetId?: string;
  /** The later stops this edit pushed for one stop of its own (`apply_plan_ops.pushed`). */
  readonly pushed?: PlanPush | null;
}

function hintOps(ops: readonly PlanOp[] | null): readonly PlanOp[] | null {
  if (ops === null) return null;
  return new TextEncoder().encode(JSON.stringify(ops)).byteLength <= MAX_HINT_OPS_BYTES
    ? ops
    : null;
}

export interface VersionRows {
  readonly versionId: string;
  readonly tripId: string;
  /** The version `next` was made from: translations and place names carry over from it. */
  readonly baseVersionId: string;
  readonly next: PlanState;
}

/**
 * Writes a new version's days and items from the plan state, and its record of the places its
 * stops point at. The version row exists; the caller runs as the system.
 */
export async function writeVersionRows(tx: pg.PoolClient, rows: VersionRows): Promise<void> {
  await tx.query(
    // A day's translations follow its theme (a reorder moves themes between day numbers).
    `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme, weather_ref, i18n,
       destination_id)
     SELECT $1, $2, d.day_no, d.date::date, d.theme, old.weather_ref,
            (SELECT t.i18n FROM plan_days t
              WHERE t.version_id = $4 AND t.theme = d.theme AND t.i18n IS NOT NULL LIMIT 1),
            d.destination_id
       FROM jsonb_to_recordset($3::jsonb) AS d(day_no int, date text, theme text,
              destination_id uuid)
       LEFT JOIN plan_days old ON old.version_id = $4 AND old.day_no = d.day_no`,
    [rows.versionId, rows.tripId, JSON.stringify(rows.next.days), rows.baseVersionId],
  );
  await tx.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, lane,
       attendee_ids, poi_id, custom_place, provider_id, booking_id, must_do_id, category,
       cost_model, amount_minor, currency, status, flexibility, is_outdoor, created_by_kind,
       notes, locked_reason, i18n)
     SELECT $1, d.id, $2, r.stable_id, r.starts_at, r.ends_at, r.tz, r.lane, r.attendee_ids,
            r.poi_id, r.custom_place, r.provider_id, r.booking_id, r.must_do_id, r.category, r.cost_model,
            r.amount_minor, r.currency, coalesce(r.status, 'proposed'), r.flexibility,
            coalesce(r.is_outdoor, false), coalesce(r.created_by_kind, 'user'), r.notes,
            r.locked_reason,
            (SELECT old.i18n FROM plan_items old
              WHERE old.version_id = $4 AND old.stable_id = r.stable_id LIMIT 1)
       FROM jsonb_to_recordset($3::jsonb) AS r(stable_id uuid, day_no int, starts_at timestamptz,
              ends_at timestamptz, tz text, lane text, attendee_ids uuid[], poi_id uuid,
              custom_place jsonb, provider_id uuid, booking_id uuid, must_do_id uuid, category text,
              cost_model text, amount_minor bigint, currency text, status text,
              flexibility text, is_outdoor boolean, created_by_kind text, notes text,
              locked_reason text)
       JOIN plan_days d ON d.version_id = $1 AND d.day_no = r.day_no`,
    [rows.versionId, rows.tripId, JSON.stringify(rows.next.items), rows.baseVersionId],
  );
  // The plan's own record of its places travels with every version, and gains the name of any
  // place a stop now points at, so a stop is named by its place on every phone, whether or not
  // that place is in the phone's catalogue (open-data places never are).
  await tx.query(
    `UPDATE itinerary_versions v SET coverage = jsonb_set(
         coalesce(b.coverage, '{}'::jsonb), '{places}',
         coalesce(b.coverage->'places', '{}'::jsonb) || coalesce((
           SELECT jsonb_object_agg(p.id::text, jsonb_build_object(
                    'name', p.name, 'category', p.category, 'lat', p.lat, 'lng', p.lng,
                    'editorial', p.curation = 'editorial'))
             FROM pois p
            WHERE p.id IN (SELECT i.poi_id FROM plan_items i
                            WHERE i.version_id = $1 AND i.poi_id IS NOT NULL)
              AND NOT (coalesce(b.coverage->'places', '{}'::jsonb) ? p.id::text)
         ), '{}'::jsonb))
       FROM itinerary_versions b
      WHERE v.id = $1 AND b.id = $2`,
    [rows.versionId, rows.baseVersionId],
  );
}

/**
 * Writes `next` as the trip's new current version on top of `baseVersionId` (the caller holds the
 * trip lock and checked the base), then queues the re-price and the stale sweep and tells the crew.
 */
export async function commitPlanVersion(tx: pg.PoolClient, input: CommitInput): Promise<string> {
  const { head, baseVersionId, next } = input;
  const versionId = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status, cost_pp_minor, currency)
       SELECT trip_id, id, visibility, 'current', cost_pp_minor, currency
         FROM itinerary_versions WHERE id = $1
       RETURNING id`,
      [baseVersionId],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new DomainError('NOT_FOUND', { reason: 'version' });
    await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
      baseVersionId,
    ]);
    await writeVersionRows(tx, { versionId: id, tripId: head.tripId, baseVersionId, next });
    await writePushes(tx, id, input, loadPlanState);
    await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [head.tripId, id]);
    return id;
  });
  await appendDomainEvent(tx, {
    type: 'plan.ops_applied',
    aggregateKind: 'trip',
    aggregateId: head.tripId,
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    payload: {
      trip_id: head.tripId,
      version_id: versionId,
      base_version_id: baseVersionId,
      op_count: input.opCount,
      source: input.source,
    },
    crewId: head.crewId,
    tripId: head.tripId,
  });
  const hint: PlanOpsHint = {
    version: versionId,
    base_version: baseVersionId,
    ops: hintOps(input.ops),
    source: input.source,
    change_set_id: input.changeSetId ?? null,
  };
  await outbox(tx, channelName('trip_plan', head.tripId), PLAN_RT.ops, hint);
  await sendInTx(tx, COST_RECOMPUTE_QUEUE, { trip_id: head.tripId }, { singletonKey: head.tripId });
  await sendInTx(
    tx,
    PLAN_QUEUES.staleSweep,
    { trip_id: head.tripId, version_id: versionId },
    { singletonKey: `${head.tripId}:${versionId}` },
  );
  return versionId;
}
