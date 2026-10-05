/**
 * What the review (7h-7) adds to a change set's own rows, from synced rows: the drive minutes the
 * kept changes add (the planner's count over the base version's stored legs, else straight lines),
 * and for a set Tokek placed from Ideas, why each stop went where it did and the ideas left for
 * the person (split, a stop would move, nowhere fits), with their names and fits.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { storedFitSchema, type ChangeSetOp, type FitReason, type StoredFit } from '@cp/domain';
import { drivingDeltaMinutes, type FitLeg, type FitPoint } from '@cp/planner';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import type { PlanItem } from '../../overview/model/plan-model';

const LEGS_SQL = `SELECT from_key, to_key, minutes, mode, approx FROM plan_legs WHERE version_id = ?`;
const POINTS_SQL = `SELECT id AS poi_id, lat, lng FROM pois WHERE id IN (SELECT value FROM json_each(?1))
  UNION ALL SELECT poi_id, lat, lng FROM trip_ideas
   WHERE trip_id = ?2 AND poi_id IN (SELECT value FROM json_each(?1))`;
const FACTOR_SQL = `SELECT d.drive_factor FROM trips t JOIN destinations d ON d.id = t.destination_id
  WHERE t.id = ?`;
const JOB_SQL = `SELECT partial FROM agent_jobs
  WHERE kind = 'place_ideas' AND trip_id = ? AND instr(coalesce(result_ref, ''), ?) > 0
  ORDER BY updated_at DESC LIMIT 1`;
const IDEAS_SQL = `SELECT id, poi_id, name, fit FROM trip_ideas WHERE id IN (SELECT value FROM json_each(?))`;

const WALK_MAX_M = 1200;

export type LeftReason = 'split' | 'needs_move' | 'full' | 'no_day';

export interface LeftForYou {
  readonly ideaId: string;
  readonly poiId: string | null;
  readonly name: string;
  readonly reason: LeftReason;
  readonly needsMove: string | null;
  readonly fit: StoredFit | null;
}

export interface ReviewExtras {
  readonly drivingDeltaMin: number;
  /** Why each placed stop went where it did, by its target. */
  readonly placedReasons: ReadonlyMap<string, readonly FitReason[]>;
  /** Null: the set wasn't placed from Ideas. */
  readonly left: readonly LeftForYou[] | null;
}

interface Partial {
  readonly routing?: {
    readonly placed?: readonly { target?: string; reasons?: FitReason[] }[];
  };
  readonly needs_you?: {
    readonly left?: readonly { idea_id: string; reason: LeftReason; needs_move?: string | null }[];
  };
}

function parse<T>(raw: string | null | undefined): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useReviewExtras(input: {
  readonly tripId: string;
  readonly changesetId: string;
  readonly baseVersionId: string | null;
  readonly baseItems: readonly PlanItem[];
  readonly ops: readonly ChangeSetOp[];
}): ReviewExtras {
  const { tripId, changesetId, baseVersionId, baseItems, ops } = input;
  const legs = useLiveRows<{
    from_key: string;
    to_key: string;
    minutes: number;
    mode: string;
    approx: number;
  }>(LEGS_SQL, baseVersionId === null ? null : [baseVersionId], ['plan_legs']);
  const added = JSON.stringify([
    ...new Set(ops.flatMap((op) => (op.after?.poi_id == null ? [] : [op.after.poi_id]))),
  ]);
  const points = useLiveRows<{ poi_id: string; lat: number; lng: number }>(
    POINTS_SQL,
    [added, tripId],
    ['pois', 'trip_ideas'],
  );
  const factor = useLiveRows<{ drive_factor: number | null }>(
    FACTOR_SQL,
    [tripId],
    ['trips', 'destinations'],
  );
  const job = useLiveRows<{ partial: string | null }>(
    JOB_SQL,
    [tripId, changesetId],
    ['agent_jobs'],
  );
  const partialRaw = job.rows[0]?.partial ?? null;
  const partial = useMemo(() => parse<Partial>(partialRaw), [partialRaw]);
  const leftIds = JSON.stringify((partial?.needs_you?.left ?? []).map((entry) => entry.idea_id));
  const ideas = useLiveRows<{
    id: string;
    poi_id: string | null;
    name: string;
    fit: string | null;
  }>(IDEAS_SQL, [leftIds], ['trip_ideas']);

  return useMemo(() => {
    const legMap = new Map<string, FitLeg>(
      legs.rows.map((leg) => [
        `${leg.from_key}>${leg.to_key}`,
        {
          minutes: leg.minutes,
          mode: leg.mode === 'walk' ? 'walk' : 'drive',
          approx: leg.approx === 1,
        },
      ]),
    );
    const pointMap = new Map<string, FitPoint>(
      points.rows.map((row) => [row.poi_id, { lat: row.lat, lng: row.lng }]),
    );
    const drivingDeltaMin = drivingDeltaMinutes({
      items: baseItems.map((item) => ({
        stableId: item.stableId,
        dayNo: item.dayNo,
        startsAt: item.startsAt,
        point: item.lat === null || item.lng === null ? null : { lat: item.lat, lng: item.lng },
      })),
      ops,
      points: pointMap,
      legs: legMap,
      driveFactor: factor.rows[0]?.drive_factor ?? 1,
      walkMaxM: WALK_MAX_M,
    });
    const placedReasons = new Map(
      (partial?.routing?.placed ?? []).flatMap((stop) =>
        stop.target === undefined ? [] : [[stop.target, stop.reasons ?? []] as const],
      ),
    );
    const byId = new Map(ideas.rows.map((row) => [row.id, row]));
    const left =
      partial?.needs_you?.left === undefined
        ? null
        : partial.needs_you.left.map((entry) => {
            const idea = byId.get(entry.idea_id);
            const fit = storedFitSchema.safeParse(parse(idea?.fit));
            return {
              ideaId: entry.idea_id,
              poiId: idea?.poi_id ?? null,
              name: idea?.name ?? '',
              reason: entry.reason,
              needsMove: entry.needs_move ?? null,
              fit: fit.success ? fit.data : null,
            };
          });
    return { drivingDeltaMin, placedReasons, left };
  }, [baseItems, factor.rows, ideas.rows, legs.rows, ops, partial, points.rows]);
}
