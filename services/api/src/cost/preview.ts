/**
 * Cost previews for plan changes (3e-3, 7h-7, the guide's `cost_quote`): loads the trip's priced
 * plan items as the caller sees them (RLS), applies ChangeSet ops, and prices before and after with
 * the same engine the recompute job uses, plus the drive minutes the kept ops add on the days they
 * touch. Only the caller's own delta and the crew-wide "each" label leave this module.
 */
import { assertCurrencyCode, type CurrencyCode, type FxContext } from '@cp/cost-engine';
import { DomainError, generateUuidV7, type ChangeSetOp } from '@cp/domain';
import {
  changeSetReview,
  drivingDeltaMinutes,
  type DriveStop,
  type FitLeg,
  type FitPoint,
  type PlanItemState,
} from '@cp/planner';
import type pg from 'pg';

/** Currency a trip is priced in when its crew has not picked a settlement currency yet. */
const DEFAULT_TRIP_CURRENCY = 'USD';

export interface PlanCostContext {
  readonly tripId: string;
  readonly currency: CurrencyCode;
  readonly members: readonly { readonly uid: string; readonly origin: string | null }[];
  readonly items: readonly PlanItemState[];
  readonly fx?: FxContext;
  /** What the driving chip reads: each stop's spot, stored legs, and the ideas' spots for adds. */
  readonly drive?: DriveContext;
}

export interface DriveContext {
  readonly stops: readonly DriveStop[];
  readonly legs: ReadonlyMap<string, FitLeg>;
  readonly points: ReadonlyMap<string, FitPoint>;
  readonly driveFactor: number;
  readonly walkMaxM: number;
}

const WALK_MAX_M = 1200;

/** The version's stops with their spots, its stored legs, and where the trip's ideas are. */
async function loadDriveContext(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string | null,
): Promise<DriveContext> {
  const [stops, legs, points, trip] = await Promise.all([
    tx.query<{
      stable_id: string;
      day_no: number;
      starts_at: Date | null;
      lat: number | null;
      lng: number | null;
    }>(
      `SELECT i.stable_id, d.day_no, i.starts_at,
              coalesce(p.lat, (i.custom_place->>'lat')::float8) AS lat,
              coalesce(p.lng, (i.custom_place->>'lng')::float8) AS lng
         FROM plan_items i JOIN plan_days d ON d.id = i.day_id
         LEFT JOIN pois p ON p.id = i.poi_id
        WHERE i.version_id = $1`,
      [versionId],
    ),
    tx.query<{ from_key: string; to_key: string; minutes: number; mode: string; approx: boolean }>(
      'SELECT from_key, to_key, minutes, mode, approx FROM plan_legs WHERE version_id = $1',
      [versionId],
    ),
    tx.query<{ poi_id: string; lat: number; lng: number }>(
      `SELECT poi_id, lat, lng FROM trip_ideas
        WHERE trip_id = $1 AND poi_id IS NOT NULL AND deleted_at IS NULL`,
      [tripId],
    ),
    tx.query<{ drive_factor: number | null }>(
      `SELECT d.drive_factor FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1`,
      [tripId],
    ),
  ]);
  return {
    stops: stops.rows.map((row) => ({
      stableId: row.stable_id,
      dayNo: row.day_no,
      startsAt: row.starts_at?.toISOString() ?? null,
      point: row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng },
    })),
    legs: new Map(
      legs.rows.map((leg) => [
        `${leg.from_key}>${leg.to_key}`,
        { minutes: leg.minutes, mode: leg.mode === 'walk' ? 'walk' : 'drive', approx: leg.approx },
      ]),
    ),
    points: new Map(points.rows.map((row) => [row.poi_id, { lat: row.lat, lng: row.lng }])),
    driveFactor: Number(trip.rows[0]?.drive_factor ?? 1),
    walkMaxM: WALK_MAX_M,
  };
}

async function loadFx(tx: pg.PoolClient): Promise<FxContext | undefined> {
  const { rows } = await tx.query<{
    id: string;
    base: string;
    quote: string;
    rate: string;
    as_of: string;
    source: string;
  }>(
    // The newest rate of every pair: the source dates each currency on its own, so the newest
    // day's rows are rarely a complete set.
    `SELECT id, base, quote, rate, as_of, source FROM (
       SELECT DISTINCT ON (base, quote) id, base, quote, rate::text AS rate, as_of::text AS as_of,
              source
         FROM fx_snapshots ORDER BY base, quote, as_of DESC, created_at DESC
     ) newest ORDER BY quote, source`,
  );
  const first = rows[0];
  if (!first) return undefined;
  return {
    snapshotId: first.id,
    snapshots: rows.map((r) => ({
      base: assertCurrencyCode(r.base),
      quote: assertCurrencyCode(r.quote),
      rate: r.rate,
      asOf: r.as_of,
      source: r.source,
    })),
  };
}

/** The trip's current plan (else the draft, when the caller may see it), priced items only. */
export async function loadPlanCostContext(
  tx: pg.PoolClient,
  tripId: string,
): Promise<PlanCostContext> {
  const trip = await tx.query<{ version_id: string | null; settlement_currency: string | null }>(
    `SELECT coalesce(t.current_version_id, t.draft_version_id) AS version_id, c.settlement_currency
       FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1`,
    [tripId],
  );
  const row = trip.rows[0];
  if (!row) throw new DomainError('NOT_FOUND', { reason: 'trip_not_found' });
  const currency = assertCurrencyCode(row.settlement_currency ?? DEFAULT_TRIP_CURRENCY);
  const members = await tx.query<{ user_id: string }>(
    'SELECT user_id FROM trip_participants WHERE trip_id = $1 AND holds_seat ORDER BY user_id',
    [tripId],
  );
  const items = await tx.query<{
    stable_id: string;
    day_no: number | null;
    starts_at: Date | null;
    ends_at: Date | null;
    attendee_ids: string[] | null;
    booking_id: string | null;
    must_do_id: string | null;
    cost_model: 'per_person' | 'group' | 'unit' | null;
    amount_minor: string | null;
    currency: string | null;
  }>(
    `SELECT i.stable_id, d.day_no, i.starts_at, i.ends_at, i.attendee_ids, i.booking_id,
            i.must_do_id, i.cost_model, i.amount_minor, i.currency
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id
      WHERE i.version_id = $1 ORDER BY i.stable_id`,
    [row.version_id],
  );
  const planItems: PlanItemState[] = items.rows.map((i) => ({
    stable_id: i.stable_id,
    ...(i.day_no !== null ? { day_no: i.day_no } : {}),
    ...(i.starts_at ? { starts_at: i.starts_at.toISOString() } : {}),
    ...(i.ends_at ? { ends_at: i.ends_at.toISOString() } : {}),
    ...(i.attendee_ids ? { attendee_ids: i.attendee_ids } : {}),
    booking_id: i.booking_id,
    must_do_id: i.must_do_id,
    ...(i.cost_model ? { cost_model: i.cost_model } : {}),
    ...(i.amount_minor !== null ? { amount_minor: Number(i.amount_minor) } : {}),
    ...(i.currency ? { currency: i.currency } : {}),
  }));
  const needsFx = planItems.some((i) => i.currency !== undefined && i.currency !== currency);
  const fx = needsFx ? await loadFx(tx) : undefined;
  return {
    tripId,
    currency,
    members: members.rows.map((m) => ({ uid: m.user_id, origin: null })),
    items: planItems,
    ...(fx ? { fx } : {}),
    drive: await loadDriveContext(tx, tripId, row.version_id),
  };
}

export interface CostPreview {
  readonly currency: CurrencyCode;
  /** The caller's own change; `null` when the caller holds no seat on the trip. */
  readonly mine: { readonly delta_minor: number; readonly display_delta_minor: number } | null;
  /** The crew-wide "+$22 each" label when every seat changes by the same rounded amount. */
  readonly each_minor: number | null;
  readonly bookings_moved: number;
  readonly must_dos_touched: number;
  /** Drive minutes the kept ops add (negative: fewer), on the days they touch. */
  readonly driving_delta_min: number;
}

export function previewCostOps(
  context: PlanCostContext,
  ops: readonly ChangeSetOp[],
  viewerUid: string,
): CostPreview {
  const review = changeSetReview({
    items: context.items,
    ops,
    members: context.members,
    currency: context.currency,
    seenAt: new Date(0).toISOString(),
    ...(context.fx ? { fx: context.fx } : {}),
  });
  const mine = review.perMember.find((m) => m.uid === viewerUid);
  return {
    currency: context.currency,
    mine: mine
      ? {
          delta_minor: Number(mine.delta.amountMinor),
          display_delta_minor: Number(mine.displayDelta.amountMinor),
        }
      : null,
    each_minor: review.each ? Number(review.each.amountMinor) : null,
    bookings_moved: review.bookingsMoved,
    must_dos_touched: review.mustDosTouched,
    driving_delta_min:
      context.drive === undefined
        ? 0
        : drivingDeltaMinutes({ ...context.drive, items: context.drive.stops, ops }),
  };
}

/** A model-proposed op (`{op, item?, new?, reason}`) as a ChangeSet op on the loaded items. */
export interface ProposedOp {
  readonly op: ChangeSetOp['op'];
  readonly item?: string | undefined;
  readonly new?: ChangeSetOp['after'];
  readonly reason: string;
}

export function toChangeSetOps(proposed: readonly ProposedOp[]): ChangeSetOp[] {
  return proposed.map((p) => ({
    op: p.op,
    target: p.op === 'add' ? generateUuidV7() : (p.item ?? generateUuidV7()),
    after: p.new ?? null,
    reason: p.reason,
    affected_user_ids: [],
    booking_impact: false,
  }));
}
