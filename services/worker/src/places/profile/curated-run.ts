/**
 * The typing pass over curated places (./curated.ts), a few places at a time. Each place's calls
 * and write stand alone: one that fails is counted and left for the next run.
 */
import type pg from 'pg';

import {
  loadCuratedTargets,
  saveCuratedTyping,
  typeCuratedPlace,
  type CuratedTypingDeps,
} from './curated';

export interface CuratedPassOptions {
  readonly force: boolean;
  readonly dryRun?: boolean;
  readonly destination?: string | undefined;
  readonly concurrency?: number;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface CuratedPassReport {
  readonly places: number;
  readonly typed: number;
  readonly failed: number;
  /** A web profile won the race and kept its row. */
  readonly kept: number;
  readonly withBestTimes: number;
  readonly withDish: number;
  readonly mealRoles: Readonly<Record<string, number>>;
  readonly byDestination: Readonly<Record<string, number>>;
  readonly costUsd: number;
  /** The first few failures' messages. */
  readonly errors: readonly string[];
}

export async function typeCuratedPlaces(
  pool: pg.Pool,
  deps: CuratedTypingDeps,
  options: CuratedPassOptions,
): Promise<CuratedPassReport> {
  const targets = await loadCuratedTargets(pool, options);
  const byDestination: Record<string, number> = {};
  for (const target of targets) byDestination[target.town] = (byDestination[target.town] ?? 0) + 1;
  const tally = {
    typed: 0,
    failed: 0,
    kept: 0,
    withBestTimes: 0,
    withDish: 0,
    costMicros: 0,
    mealRoles: {} as Record<string, number>,
    errors: [] as string[],
  };
  if (options.dryRun === true) {
    const { costMicros: _none, ...counts } = tally;
    return { places: targets.length, ...counts, byDestination, costUsd: 0 };
  }
  let next = 0;
  let done = 0;
  const lane = async () => {
    while (next < targets.length) {
      const target = targets[next++];
      if (target === undefined) break;
      try {
        const typed = await typeCuratedPlace(deps, target);
        tally.costMicros += typed.costMicros;
        if (await saveCuratedTyping(pool, target.id, typed)) {
          tally.typed += 1;
          if (typed.bestTimes.length > 0) tally.withBestTimes += 1;
          if (typed.dish !== null) tally.withDish += 1;
          const role = typed.mealRole ?? 'unsure';
          tally.mealRoles[role] = (tally.mealRoles[role] ?? 0) + 1;
        } else {
          tally.kept += 1;
        }
      } catch (error) {
        tally.failed += 1;
        if (tally.errors.length < 5) tally.errors.push(String(error).slice(0, 200));
      }
      done += 1;
      options.onProgress?.(done, targets.length);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 8 }, lane));
  const { costMicros, ...counts } = tally;
  return {
    places: targets.length,
    ...counts,
    byDestination,
    costUsd: Math.round(costMicros / 100) / 10_000,
  };
}
