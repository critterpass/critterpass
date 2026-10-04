/**
 * The road a stored leg follows, for the maps: our Valhalla's route shape for the leg's chosen
 * mode (walk on foot, every other mode by car), simplified for display and encoded. Consecutive
 * legs of a day in the same mode go to the router as one multi-point route; when that fails (one
 * point off the road graph fails the whole route) each leg is asked alone. A leg the router cannot
 * draw, a straight-line estimate, or any leg while the router is down keeps no shape: the phone
 * draws it straight. Shapes are never put in the route cache; a leg whose mode and metres did not
 * change keeps the shape it already has, so a replay asks the router nothing.
 */
import {
  encodePolyline,
  PLAN_LEG_SHAPE_MAX_POINTS,
  PLAN_LEG_SHAPE_PRECISION,
  PLAN_LEG_SHAPE_TOLERANCE_M,
  simplifyPath,
  type LngLat,
} from '@cp/domain';
import {
  ValhallaError,
  type ChosenLeg,
  type ValhallaClient,
  type ValhallaCosting,
} from '@cp/suppliers';

import type { LegPair } from './pairs';

export type LegRouter = Pick<ValhallaClient, 'route'>;

/** Shapes already stored for the trip, by `storedShapeKey`. */
export type StoredShapes = ReadonlyMap<string, string>;

export interface ShapeLeg extends ChosenLeg {
  readonly pair: LegPair;
}

/** The longest route asked at once (Valhalla's smallest per-costing location limit is 20). */
const MAX_ROUTE_POINTS = 20;
const PER_LEG_CONCURRENCY = 3;

export const storedShapeKey = (leg: {
  readonly fromKey: string;
  readonly toKey: string;
  readonly mode: string;
  readonly meters: number;
}) => `${leg.fromKey}>${leg.toKey}:${leg.mode}:${leg.meters}`;

const costingFor = (mode: ChosenLeg['mode']): ValhallaCosting =>
  mode === 'walk' ? 'pedestrian' : 'auto';

export function encodeLegShape(shape: readonly LngLat[] | undefined): string | null {
  if (shape === undefined) return null;
  const simplified = simplifyPath(shape, {
    toleranceM: PLAN_LEG_SHAPE_TOLERANCE_M,
    maxPoints: PLAN_LEG_SHAPE_MAX_POINTS,
  });
  return simplified.length < 2 ? null : encodePolyline(simplified, PLAN_LEG_SHAPE_PRECISION);
}

/** Runs of legs to route together: same costing, each starting where the previous one ended. */
function chains(legs: readonly ShapeLeg[], pending: readonly number[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  for (const index of pending) {
    const leg = legs[index] as ShapeLeg;
    const last = run.at(-1);
    const previous = last === undefined ? undefined : legs[last];
    const joins =
      previous !== undefined &&
      last === index - 1 &&
      costingFor(previous.mode) === costingFor(leg.mode) &&
      previous.pair.toKey === leg.pair.fromKey &&
      run.length + 1 < MAX_ROUTE_POINTS;
    if (!joins && run.length > 0) {
      runs.push(run);
      run = [];
    }
    run.push(index);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** The encoded shape of each leg, in order, or null where the leg is drawn straight. */
export async function legShapes(
  router: LegRouter | null,
  legs: readonly ShapeLeg[],
  stored: StoredShapes,
  onError?: (error: unknown) => void,
): Promise<(string | null)[]> {
  const shapes: (string | null)[] = legs.map(() => null);
  const pending: number[] = [];
  legs.forEach((leg, index) => {
    if (leg.source !== 'valhalla') return;
    const kept = stored.get(storedShapeKey({ ...leg.pair, mode: leg.mode, meters: leg.meters }));
    if (kept === undefined) pending.push(index);
    else shapes[index] = kept;
  });
  if (router === null) return shapes;

  let routerDown = false;
  const route = async (run: readonly number[]): Promise<boolean> => {
    if (routerDown) return false;
    const first = legs[run[0] as number] as ShapeLeg;
    const points = [first.pair.from, ...run.map((index) => (legs[index] as ShapeLeg).pair.to)];
    try {
      const answer = await router.route(points, costingFor(first.mode));
      if (answer.legs.length !== run.length) return false;
      run.forEach((index, i) => {
        shapes[index] = encodeLegShape(answer.legs[i]?.shape);
      });
      return true;
    } catch (error) {
      onError?.(error);
      // A dead router fails every call alike; an answer it could not route may be one bad point.
      if (
        error instanceof ValhallaError &&
        (error.kind === 'unavailable' || error.kind === 'circuit_open')
      ) {
        routerDown = true;
      }
      return false;
    }
  };

  for (const run of chains(legs, pending)) {
    if (await route(run)) continue;
    if (run.length === 1 || routerDown) continue;
    for (let start = 0; start < run.length; start += PER_LEG_CONCURRENCY) {
      await Promise.all(run.slice(start, start + PER_LEG_CONCURRENCY).map((i) => route([i])));
    }
  }
  return shapes;
}
