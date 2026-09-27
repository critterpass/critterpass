/**
 * Travel-data AI tool executors (docs/api-contracts.md §6): numbers come from the cached tables
 * only, never from the model, and a missing or stale value is left out rather than guessed.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withUser } from '@cp/db';
import { iataCodeSchema, monthKeySchema } from '@cp/domain';
import type pg from 'pg';

import { resolveDestination } from './destination-ref';
import { readFares } from './fares-read';
import { convertWithSnapshots } from './fx';

function readAs<T>(pool: pg.Pool, context: ToolContext, fn: (tx: pg.PoolClient) => Promise<T>) {
  return withUser(pool, context.uid, 'guide', fn);
}

export function registerTravelDataToolExecutors(registry: ToolRegistry, pool: pg.Pool): void {
  // "~$X (seen {time})": one entry per departure day with a fresh price; a borrowed hub fare is
  // reported under the hub's code so the guide never presents it as the origin's own.
  registry.registerToolExecutor('fare_calendar', (input, context) =>
    readAs(pool, context, async (tx) => {
      const destination = await resolveDestination(tx, input.dest);
      const destIata = destination.travel?.airports[0];
      if (destIata === undefined) return [];
      const fares = await readFares(tx, {
        origins: input.origins.map((origin) => iataCodeSchema.parse(origin.toUpperCase())),
        destIata,
        month: monthKeySchema.parse(input.month),
      });
      return fares.flatMap((fare) =>
        fare.state !== 'ok' || fare.seen_at === null
          ? []
          : fare.days.map((day) => ({
              origin: fare.via_hub ?? fare.origin,
              date: day.depart_on,
              price_minor: day.price_minor,
              currency: fare.currency,
              seen_at: fare.seen_at as string,
            })),
      );
    }),
  );

  // Converted at the stored snapshot rate; no snapshot relating the pair = unavailable, never a
  // guessed rate.
  registry.registerToolExecutor('fx', (input, context) =>
    readAs(pool, context, async (tx) => {
      const conversion = await convertWithSnapshots(
        tx,
        input.amount_minor,
        input.from.toUpperCase(),
        input.to.toUpperCase(),
      );
      if (conversion === null)
        throw new Error(`no FX snapshot relates ${input.from} and ${input.to}`);
      return {
        amount_minor: conversion.to.amount_minor,
        rate: conversion.rate,
        snapshot_id: conversion.snapshot_id,
      };
    }),
  );
}
