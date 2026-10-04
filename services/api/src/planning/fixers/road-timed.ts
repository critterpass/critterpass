/**
 * A fix is timed on real travel before it is offered. The check input knows the stored legs of the
 * pairs the plan has now and guesses (straight lines) for every other pair, and a fix that
 * reorders a day makes pairs the plan never had. Here the pairs a fix would create are routed
 * through planning travel (route cache first, one batched lookup, a hard budget for the request),
 * the fix is worked out again on what was learned, and its result is checked: a fix that leaves
 * one of the stops it moves in a clash is not offered. A fix whose new pairs could not all be
 * routed inside the budget is offered as `checked: false`, so the screen says its times are
 * estimates.
 */
import type { ChangeSetOp } from '@cp/domain';
import {
  checkPlan,
  instantAt,
  layeredTravel,
  legKey,
  straightLineTravel,
  type CheckInput,
  type FitDay,
  type FitItem,
  type FitLeg,
  type FitPoint,
  type FitStop,
} from '@cp/planner';

import type { LegPair, TravelSource } from '../fit/context';
import type { LoadedCheckInput } from './check-input';

/** The whole lookup of one request, every round included. */
export const ROAD_BUDGET_MS = 3000;
const MAX_ROUNDS = 3;

export interface Roads {
  /** The check input on the travel known so far. */
  input(): CheckInput;
  /** Routes the pairs `ops` would create that are still guesses; true when something was learned. */
  learn(ops: readonly ChangeSetOp[], points?: ReadonlyMap<string, FitPoint>): Promise<boolean>;
  /**
   * Whether the plan after `ops` leaves a moved stop in a clash (or past the end of its day), and
   * whether every leg of the days it touches is a routed one.
   */
  verdict(ops: readonly ChangeSetOp[], points?: ReadonlyMap<string, FitPoint>): RoadVerdict;
}

export interface RoadVerdict {
  readonly clash: boolean;
  readonly checked: boolean;
}

/** The days as they would be after the ops: retimes move a stop, a swap puts it at a new place. */
export function daysAfter(
  days: readonly FitDay[],
  ops: readonly ChangeSetOp[],
  points: ReadonlyMap<string, FitPoint> = new Map(),
): FitDay[] {
  const byTarget = new Map(ops.map((op) => [op.target, op]));
  return days.map((day) => ({
    ...day,
    items: day.items.map((item): FitItem => {
      const after = byTarget.get(item.stableId)?.after ?? null;
      if (after === null) return item;
      const poiId = after.poi_id === undefined ? item.poiId : after.poi_id;
      return {
        ...item,
        startsAt: typeof after.starts_at === 'string' ? new Date(after.starts_at) : item.startsAt,
        endsAt: typeof after.ends_at === 'string' ? new Date(after.ends_at) : item.endsAt,
        poiId,
        point: points.get(item.stableId) ?? item.point,
      };
    }),
  }));
}

/** A day's route as the legs job reads it: the stay, its stops with a place in time order, the stay. */
function routePairs(day: FitDay): LegPair[] {
  const stops: FitStop[] = day.items
    .filter((item) => item.category !== 'stay' && item.point !== null)
    .sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.endsAt.getTime() - b.endsAt.getTime() ||
        (a.stableId < b.stableId ? -1 : 1),
    )
    .map((item) => ({ key: item.stableId, ...(item.point as FitPoint) }));
  const ends: FitStop[] =
    day.stay === null || stops.length === 0
      ? stops
      : [{ key: 'stay', ...day.stay }, ...stops, { key: 'stay', ...day.stay }];
  return ends.flatMap((to, index) => {
    const from = ends[index - 1];
    return from === undefined ? [] : [{ from, to }];
  });
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  if (ms <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export function roadsFor(
  check: LoadedCheckInput,
  source: TravelSource | null,
  budgetMs: number = ROAD_BUDGET_MS,
  clock: () => number = Date.now,
): Roads {
  const { context } = check.input;
  const straight = straightLineTravel(context.driveFactor, check.loaded.thresholds.walkMaxM);
  const known = new Map<string, FitLeg>(check.loaded.storedLegs);
  const deadline = clock() + budgetMs;
  /** Stops a swap moved to another place: what was stored for them is about the old place. */
  const moved = new Set<string>();

  const has = (pair: LegPair) =>
    known.get(legKey(pair.from.key, pair.to.key)) ??
    known.get(legKey(pair.to.key, pair.from.key)) ??
    null;
  const touchedDays = (ops: readonly ChangeSetOp[], points?: ReadonlyMap<string, FitPoint>) => {
    const targets = new Set(ops.map((op) => op.target));
    return daysAfter(context.days, ops, points).filter((day) =>
      day.items.some((item) => targets.has(item.stableId)),
    );
  };
  const forget = (points?: ReadonlyMap<string, FitPoint>) => {
    for (const stableId of points?.keys() ?? []) {
      if (moved.has(stableId)) continue;
      moved.add(stableId);
      for (const key of [...known.keys()]) {
        if (key.startsWith(`${stableId}>`) || key.endsWith(`>${stableId}`)) known.delete(key);
      }
    }
  };
  const input = (): CheckInput => ({
    ...check.input,
    context: { ...context, travel: layeredTravel(known, straight) },
  });

  return {
    input,
    async learn(ops, points) {
      forget(points);
      const missing = touchedDays(ops, points)
        .flatMap(routePairs)
        .filter((pair) => has(pair) === null);
      if (missing.length === 0 || source === null) return false;
      const routed = await within(source.legs(missing), deadline - clock());
      if (routed === null) return false;
      let learned = false;
      for (const [key, leg] of routed) {
        if (leg.approx) continue;
        known.set(key, leg);
        learned = true;
      }
      return learned;
    },
    verdict(ops, points) {
      forget(points);
      const days = touchedDays(ops, points);
      const targets = new Set(ops.map((op) => op.target));
      const after: CheckInput = {
        ...input(),
        context: { ...input().context, days: daysAfter(context.days, ops, points) },
        fixers: {},
      };
      const clash = checkPlan(after).some(
        (issue) => issue.kind === 'clash' && issue.stableIds.some((id) => targets.has(id)),
      );
      // A stop moved past the end of the day (22:00, or as late as it already ran) is no fix.
      const late = days.some((day) => {
        const end = instantAt(day.date, day.toMin, context.tz).getTime();
        const was = new Map(
          context.days
            .find((entry) => entry.dayId === day.dayId)
            ?.items.map((item) => [item.stableId, item.endsAt.getTime()] as const),
        );
        return day.items.some(
          (item) =>
            targets.has(item.stableId) &&
            item.endsAt.getTime() > Math.max(end, was.get(item.stableId) ?? 0),
        );
      });
      const checked = days.flatMap(routePairs).every((pair) => has(pair)?.approx === false);
      return { clash: clash || late, checked };
    },
  };
}

/** The roads of one request, on the fixers' planning travel (none configured: guesses only). */
export function roadsOf(
  check: LoadedCheckInput,
  deps: { readonly travel?: (driveFactor: number, walkMaxM: number) => TravelSource },
): Roads {
  const { driveFactor } = check.input.context;
  return roadsFor(check, deps.travel?.(driveFactor, check.loaded.thresholds.walkMaxM) ?? null);
}

/**
 * Works a fix out, routes what it would create and works it out again until nothing new is
 * learned; null when there is no fix or its result leaves a clash.
 */
export async function settle<T extends { readonly ops: readonly ChangeSetOp[] }>(
  roads: Roads,
  compute: (input: CheckInput) => T | null,
  pointsOf: (fix: T) => ReadonlyMap<string, FitPoint> | undefined = () => undefined,
): Promise<{ readonly fix: T; readonly checked: boolean } | null> {
  let fix = compute(roads.input());
  for (let round = 0; fix !== null && round < MAX_ROUNDS; round += 1) {
    if (!(await roads.learn(fix.ops, pointsOf(fix)))) break;
    fix = compute(roads.input());
  }
  if (fix === null) return null;
  const { clash, checked } = roads.verdict(fix.ops, pointsOf(fix));
  return clash ? null : { fix, checked };
}
