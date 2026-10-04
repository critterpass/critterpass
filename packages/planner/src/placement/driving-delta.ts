/**
 * How much more (or less) the crew drives with a change set kept (7h-7 "+1H20 DRIVING"): on every
 * day the kept ops touch, the drive minutes between consecutive stops in start order, before and
 * after. Walking legs don't count. Legs come from stored legs where the plan has them, else
 * straight-line minutes with the destination's drive factor, as the fit engine reads them.
 */
import type { ChangeSetOp } from '@cp/domain';

import {
  layeredTravel,
  straightLineTravel,
  type FitLeg,
  type FitPoint,
  type FitTravel,
} from '../fit/context';

export interface DriveStop {
  readonly stableId: string;
  readonly dayNo: number;
  readonly startsAt: string | null;
  readonly point: FitPoint | null;
}

export interface DrivingDeltaInput {
  readonly items: readonly DriveStop[];
  readonly ops: readonly ChangeSetOp[];
  /** Where an added place is, by its place id (an added pin carries its own spot). */
  readonly points: ReadonlyMap<string, FitPoint>;
  /** Stored legs by `from>to` stable ids. */
  readonly legs: ReadonlyMap<string, FitLeg>;
  readonly driveFactor: number;
  readonly walkMaxM: number;
}

function driveMinutes(stops: readonly DriveStop[], travel: FitTravel): number {
  const placed = stops
    .filter((stop) => stop.point !== null && stop.startsAt !== null)
    .sort(
      (a, b) =>
        Date.parse(a.startsAt ?? '') - Date.parse(b.startsAt ?? '') ||
        (a.stableId < b.stableId ? -1 : 1),
    );
  let total = 0;
  for (let index = 1; index < placed.length; index += 1) {
    const from = placed[index - 1];
    const to = placed[index];
    if (from?.point == null || to?.point == null) continue;
    const leg = travel({ key: from.stableId, ...from.point }, { key: to.stableId, ...to.point });
    if (leg !== null && leg.mode === 'drive') total += leg.minutes;
  }
  return total;
}

function afterOps(input: DrivingDeltaInput): DriveStop[] {
  const byId = new Map(input.items.map((stop) => [stop.stableId, stop]));
  for (const op of input.ops) {
    if (op.accepted === false) continue;
    if (op.op === 'remove') {
      byId.delete(op.target);
      continue;
    }
    const after = op.after ?? null;
    if (after === null) continue;
    const current = byId.get(op.target);
    const point =
      after.custom_place != null
        ? { lat: after.custom_place.lat, lng: after.custom_place.lng }
        : after.poi_id != null
          ? (input.points.get(after.poi_id) ?? null)
          : (current?.point ?? null);
    byId.set(op.target, {
      stableId: op.target,
      dayNo: after.day_no ?? current?.dayNo ?? 0,
      startsAt: after.starts_at ?? current?.startsAt ?? null,
      point: op.op === 'add' ? point : (current?.point ?? point),
    });
  }
  return [...byId.values()];
}

export function drivingDeltaMinutes(input: DrivingDeltaInput): number {
  const kept = input.ops.filter((op) => op.accepted !== false);
  if (kept.length === 0) return 0;
  const travel = layeredTravel(input.legs, straightLineTravel(input.driveFactor, input.walkMaxM));
  const after = afterOps(input);
  const touched = new Set<number>();
  const before = new Map(input.items.map((stop) => [stop.stableId, stop]));
  for (const stop of after) {
    const was = before.get(stop.stableId);
    if (kept.some((op) => op.target === stop.stableId)) {
      touched.add(stop.dayNo);
      if (was !== undefined) touched.add(was.dayNo);
    }
  }
  for (const op of kept) {
    const was = before.get(op.target);
    if (op.op === 'remove' && was !== undefined) touched.add(was.dayNo);
  }
  let delta = 0;
  for (const dayNo of touched) {
    delta += driveMinutes(
      after.filter((stop) => stop.dayNo === dayNo),
      travel,
    );
    delta -= driveMinutes(
      input.items.filter((stop) => stop.dayNo === dayNo),
      travel,
    );
  }
  return delta;
}
