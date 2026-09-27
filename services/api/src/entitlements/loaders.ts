/**
 * The `EntitlementSource` loader registry (docs/product-decisions.md §3 "Loaders registry on
 * server; purchase tables arrive later and register loaders — with no sources everyone resolves to
 * Free"). `materialise.ts` calls these two functions; nothing here reads a purchase
 * table directly, so this file has no real behaviour to add until a loader is registered — the
 * empty-registry case (Free for everyone) is exactly as real a state as a populated one.
 */
import { type EntitlementSource } from '@cp/entitlements';
import type pg from 'pg';

export interface UserSourceLoaderContext {
  readonly tx: pg.PoolClient;
  readonly uid: string;
}

export interface TripSourceLoaderContext {
  readonly tx: pg.PoolClient;
  readonly tripId: string;
  readonly crewId: string;
}

export type UserSourceLoader = (
  ctx: UserSourceLoaderContext,
) => Promise<readonly EntitlementSource[]>;

export type TripSourceLoader = (
  ctx: TripSourceLoaderContext,
) => Promise<readonly EntitlementSource[]>;

const userSourceLoaders: UserSourceLoader[] = [];
const tripSourceLoaders: TripSourceLoader[] = [];

/** Registers a loader contributing to a user's raw source pool (their own store sub, any FTF grant
 * across their trips, any crew-year grant across their crews, any redeemed code). */
export function registerUserSourceLoader(loader: UserSourceLoader): void {
  userSourceLoaders.push(loader);
}

/** Registers a loader contributing to one trip's raw source pool (that trip's own boost/FTF grant,
 * plus any crew-year grant covering its crew). */
export function registerTripSourceLoader(loader: TripSourceLoader): void {
  tripSourceLoaders.push(loader);
}

export async function loadUserSources(ctx: UserSourceLoaderContext): Promise<EntitlementSource[]> {
  const perLoader = await Promise.all(userSourceLoaders.map((loader) => loader(ctx)));
  return perLoader.flat();
}

export async function loadTripSources(ctx: TripSourceLoaderContext): Promise<EntitlementSource[]> {
  const perLoader = await Promise.all(tripSourceLoaders.map((loader) => loader(ctx)));
  return perLoader.flat();
}

/** Test-only: clears every registered loader so one test file's registrations cannot leak into
 * another (mirrors `@cp/db`'s `resetEventAppendedHooksForTests`). */
export function resetSourceLoadersForTests(): void {
  userSourceLoaders.length = 0;
  tripSourceLoaders.length = 0;
}
