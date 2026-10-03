/**
 * Fit's travel for place insertions on planning travel: a candidate place between two stops needs
 * stop → place and place → stop minutes. Pairs are batched so a stop with many places is one
 * matrix row (or column), not one call each, then walk and drive go through the same rule as
 * stored legs (walk ≤ the walking limit and 15 min, else car × the drive factor). Valhalla misses
 * come back as "about" minutes, so every asked pair gets an answer.
 */
import { legKey, type FitLeg, type FitStop } from '@cp/planner';
import { chooseLegMode, type PlanningTravel, type PlanningTravelResult } from '@cp/suppliers';

import type { LegPair, TravelSource } from '../planning/fit/context';

type Mode = 'walk' | 'drive';

interface Batch {
  readonly sources: FitStop[];
  readonly destinations: FitStop[];
  readonly pairs: LegPair[];
}

const pointKey = (stop: FitStop) => `${stop.lat},${stop.lng}`;

/** Splits pairs so each batch's matrix is as narrow as the shared end allows. */
function batches(pairs: readonly LegPair[]): Batch[] {
  const fromCount = new Map<string, number>();
  const toCount = new Map<string, number>();
  for (const { from, to } of pairs) {
    fromCount.set(pointKey(from), (fromCount.get(pointKey(from)) ?? 0) + 1);
    toCount.set(pointKey(to), (toCount.get(pointKey(to)) ?? 0) + 1);
  }
  const byFrom: LegPair[] = [];
  const byTo: LegPair[] = [];
  for (const pair of pairs) {
    const shared =
      (fromCount.get(pointKey(pair.from)) ?? 0) >= (toCount.get(pointKey(pair.to)) ?? 0);
    (shared ? byFrom : byTo).push(pair);
  }
  return [byFrom, byTo]
    .filter((group) => group.length > 0)
    .map((group) => {
      const sources = new Map<string, FitStop>();
      const destinations = new Map<string, FitStop>();
      for (const { from, to } of group) {
        sources.set(pointKey(from), from);
        destinations.set(pointKey(to), to);
      }
      return {
        sources: [...sources.values()],
        destinations: [...destinations.values()],
        pairs: group,
      };
    });
}

async function cellsFor(travel: PlanningTravel, batch: Batch, mode: Mode) {
  const matrix = await travel.matrix(batch.sources, batch.destinations, mode);
  const row = new Map(batch.sources.map((stop, i) => [pointKey(stop), i]));
  const col = new Map(batch.destinations.map((stop, j) => [pointKey(stop), j]));
  return (pair: LegPair): PlanningTravelResult | undefined =>
    matrix[row.get(pointKey(pair.from)) ?? -1]?.[col.get(pointKey(pair.to)) ?? -1];
}

/** `FitDeps.travel`: planning minutes for insertions, with the trip's drive factor. */
export function planningFitTravel(
  travel: PlanningTravel,
): (driveFactor: number, walkMaxM: number) => TravelSource {
  return (driveFactor, walkMaxM) => ({
    async legs(pairs) {
      const legs = new Map<string, FitLeg>();
      for (const batch of batches(pairs)) {
        const [walk, drive] = await Promise.all([
          cellsFor(travel, batch, 'walk'),
          cellsFor(travel, batch, 'drive'),
        ]);
        for (const pair of batch.pairs) {
          const walkLeg = walk(pair);
          const driveLeg = drive(pair);
          if (walkLeg === undefined || driveLeg === undefined) continue;
          const chosen = chooseLegMode({
            walk: walkLeg,
            drive: driveLeg,
            driverAssigned: false,
            driveFactor,
            walkMaxM,
          });
          legs.set(legKey(pair.from.key, pair.to.key), {
            minutes: chosen.minutes,
            mode: chosen.mode === 'walk' ? 'walk' : 'drive',
            approx: chosen.approx,
          });
        }
      }
      return legs;
    },
  });
}
