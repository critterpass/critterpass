/**
 * Travel for every pair of a version: one walk and one drive matrix per day (cached pairs are not
 * routed again), then the walk / car / driver rule with the destination's drive factor, then the
 * road shape of each routed leg for the maps (`shapes.ts`). Minutes and metres come from the
 * matrices alone; the shape is only drawn. No driver assignment data exists yet, so no leg is a
 * driver leg until it does.
 */
import type { LegMode, LegSource } from '@cp/domain';
import { chooseLegMode, type ChosenLeg, type PlanningTravel } from '@cp/suppliers';

import { isStayPair, versionPairs, type LegPair, type LegPoint, type PlannedDay } from './pairs';
import { legShapes, type LegRouter, type ShapeLeg, type StoredShapes } from './shapes';

export interface ComputedLeg extends Omit<ChosenLeg, 'mode' | 'source'> {
  readonly mode: LegMode;
  readonly source: LegSource;
  readonly dayId: string;
  readonly fromKey: string;
  readonly toKey: string;
  /** Encoded road shape (`PLAN_LEG_SHAPE_PRECISION`), or null where the map draws it straight. */
  readonly shape: string | null;
}

export interface LegShapeOptions {
  readonly router: LegRouter | null;
  readonly stored?: StoredShapes;
  readonly onError?: (error: unknown) => void;
}

async function diagonal(travel: PlanningTravel, pairs: readonly LegPair[], mode: 'walk' | 'drive') {
  const cells = await travel.matrix(
    pairs.map((pair) => pair.from),
    pairs.map((pair) => pair.to),
    mode,
  );
  return pairs.map((pair, i) => {
    const cell = cells[i]?.[i];
    if (cell === undefined) throw new Error(`no ${mode} cell for ${pair.fromKey}>${pair.toKey}`);
    return cell;
  });
}

/** Metres as the crow flies, for a link leg (it has no road). */
function crowMetres(a: LegPoint, b: LegPoint): number {
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.round(Math.hypot(dx, (a.lat - b.lat) * 111_320));
}

/**
 * A day trip's stay legs are its link's, never asked of the road graph; with no link they are not
 * stored at all rather than guessed. Every other pair is routed.
 */
function linkLegs(days: readonly PlannedDay[], pairs: readonly LegPair[]) {
  const away = new Map(days.flatMap((day) => (day.away ? [[day.dayId, day.away] as const] : [])));
  const linked: ComputedLeg[] = [];
  const routed = pairs.filter((pair) => {
    const trip = away.get(pair.dayId);
    if (trip === undefined || !isStayPair(pair)) return true;
    if (trip.link !== null) {
      linked.push({
        dayId: pair.dayId,
        fromKey: pair.fromKey,
        toKey: pair.toKey,
        mode: trip.link.mode,
        minutes: trip.link.minutes,
        meters: crowMetres(pair.from, pair.to),
        source: 'link',
        approx: true,
        shape: null,
      });
    }
    return false;
  });
  return { linked, routed };
}

export async function computeVersionLegs(
  travel: PlanningTravel,
  days: readonly PlannedDay[],
  driveFactor: number,
  shapes: LegShapeOptions = { router: null },
): Promise<ComputedLeg[]> {
  const { linked, routed: pairs } = linkLegs(days, versionPairs(days));
  const legs: ComputedLeg[] = [...linked];
  for (const dayId of new Set(pairs.map((pair) => pair.dayId))) {
    const dayPairs = pairs.filter((pair) => pair.dayId === dayId);
    const [walk, drive] = await Promise.all([
      diagonal(travel, dayPairs, 'walk'),
      diagonal(travel, dayPairs, 'drive'),
    ]);
    const chosen: ShapeLeg[] = [];
    dayPairs.forEach((pair, i) => {
      const walkLeg = walk[i];
      const driveLeg = drive[i];
      if (walkLeg === undefined || driveLeg === undefined) return;
      const leg = chooseLegMode({
        walk: walkLeg,
        drive: driveLeg,
        driverAssigned: false,
        driveFactor,
      });
      chosen.push({ ...leg, pair });
    });
    const drawn = await legShapes(
      shapes.router,
      chosen,
      shapes.stored ?? new Map(),
      shapes.onError,
    );
    chosen.forEach(({ pair, ...leg }, i) => {
      legs.push({
        dayId: pair.dayId,
        fromKey: pair.fromKey,
        toKey: pair.toKey,
        ...leg,
        shape: drawn[i] ?? null,
      });
    });
  }
  return legs;
}
