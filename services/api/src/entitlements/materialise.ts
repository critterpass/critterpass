/**
 * `recomputeUser`/`recomputeTrip` (docs/product-decisions.md §3 "materialised server-side into
 * synced rows"): load raw sources via the registry (./loaders.ts), resolve them with the pure engine
 * (`@cp/entitlements`), and write the one row per subject the app/extensions read offline. Every
 * write here happens on the transaction the caller passes in (`withUser`/`withSystem` from `@cp/db`);
 * this module never opens its own transaction, so a caller can compose a recompute into a larger
 * command tx (e.g. right after applying a membership change).
 */
import {
  type Clock,
  type EntitlementSource,
  resolveTripCapabilities,
  resolveUserCapabilities,
  systemClock,
  type TripCapabilities,
  type UserCapabilities,
} from '@cp/entitlements';
import type pg from 'pg';

import { loadTripSources, loadUserSources } from './loaders';
import {
  crewMemberUids,
  notifyTripEntitlementChanged,
  notifyUserEntitlementChanged,
} from './notify';

/**
 * `trips.redraft_limit`/`trip_entitlements.redraft_limit` are `integer NOT NULL`; `redraftLimit()`
 * (`@cp/entitlements`) returns `Infinity` for an unlimited trip. Postgres's `int4` max stands in for
 * "unlimited" in storage; every reader converts back via `fromStoredRedraftLimit`.
 */
export const REDRAFT_LIMIT_SENTINEL = 2_147_483_647;

export function toStoredRedraftLimit(limit: number): number {
  return limit === Infinity ? REDRAFT_LIMIT_SENTINEL : limit;
}

export function fromStoredRedraftLimit(stored: number): number {
  return stored >= REDRAFT_LIMIT_SENTINEL ? Infinity : stored;
}

function latestEndOfActiveSource(
  source: EntitlementSource,
  userId: string,
  now: number,
): number | null {
  switch (source.kind) {
    case 'store_sub':
      if (source.status === 'cancelled_active') {
        const end = Date.parse(source.currentPeriodEnd);
        return end >= now ? end : null;
      }
      if (source.status === 'grace' || source.status === 'billing_retry') {
        if (source.graceEndsAt === undefined) return null;
        const end = Date.parse(source.graceEndsAt);
        return end >= now ? end : null;
      }
      // 'active': auto-renewing with no known end while it keeps renewing. 'paused'/'expired'/
      // 'revoked': not currently contributing to Pass+ at all.
      return null;
    case 'ftf': {
      const end = Date.parse(source.endsAt);
      return end >= now ? end : null;
    }
    case 'crew_year': {
      if (source.buyerUserId !== userId) return null;
      const end = Date.parse(source.validTo);
      return end >= now ? end : null;
    }
    case 'code_grant': {
      const end = Date.parse(source.expiresAt);
      return end >= now ? end : null;
    }
    case 'trip_boost':
      // Boost alone never grants Pass+ (docs/product-decisions.md §3).
      return null;
  }
}

/**
 * The latest known end instant among the sources currently keeping `passPlus` true, or `null` when
 * either nothing does or the only contributor is an actively auto-renewing subscription (which has
 * no scheduled end while it keeps renewing — `null` there means "indefinite", not "unknown"). This is
 * cache metadata for `user_entitlements.expires_at`, never read back by the resolution engine itself.
 */
function passPlusExpiresAt(
  sources: readonly EntitlementSource[],
  userId: string,
  clock: Clock,
): Date | null {
  const now = clock.now().getTime();
  const ends = sources
    .map((source) => latestEndOfActiveSource(source, userId, now))
    .filter((end): end is number => end !== null);
  return ends.length === 0 ? null : new Date(Math.max(...ends));
}

/** `[]` = only the always-free default + free alternates; `['all']` = every style unlocked
 * (docs/product-decisions.md §3). See packages/db/src/schema/entitlements.ts for why this column is
 * not yet a named-style list. */
function iconStylesColumn(capabilities: UserCapabilities): readonly string[] {
  return capabilities.iconStylesAll ? ['all'] : [];
}

export interface UserEntitlementsRow {
  readonly userId: string;
  readonly passPlus: boolean;
  readonly guideUnlimitedGlobal: boolean;
  readonly iconStyles: readonly string[];
  readonly expiresAt: Date | null;
  readonly computedAt: Date;
}

/**
 * Resolves `uid`'s user-scoped capabilities from every registered `UserSourceLoader` and writes
 * `user_entitlements`, notifying `user:#uid` in the same transaction. `guide_unlimited_global`
 * reflects `passPlus` alone (a user-level, trip-independent signal): Boost's per-trip unlimited guide
 * is `trip_entitlements`' concern, resolved by `recomputeTrip` instead.
 */
export async function recomputeUser(
  tx: pg.PoolClient,
  uid: string,
  clock: Clock = systemClock,
): Promise<UserEntitlementsRow> {
  const sources = await loadUserSources({ tx, uid });
  const capabilities = resolveUserCapabilities(sources, uid, clock);
  const computedAt = clock.now();
  const expiresAt = passPlusExpiresAt(sources, uid, clock);
  const iconStyles = iconStylesColumn(capabilities);

  await tx.query(
    `INSERT INTO user_entitlements (user_id, pass_plus, sources, expires_at, guide_unlimited_global, icon_styles, computed_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       pass_plus = EXCLUDED.pass_plus, sources = EXCLUDED.sources, expires_at = EXCLUDED.expires_at,
       guide_unlimited_global = EXCLUDED.guide_unlimited_global, icon_styles = EXCLUDED.icon_styles,
       computed_at = EXCLUDED.computed_at`,
    [
      uid,
      capabilities.passPlus,
      JSON.stringify(sources),
      expiresAt,
      capabilities.passPlus,
      iconStyles,
      computedAt,
    ],
  );
  await notifyUserEntitlementChanged(tx, uid);

  return {
    userId: uid,
    passPlus: capabilities.passPlus,
    guideUnlimitedGlobal: capabilities.passPlus,
    iconStyles,
    expiresAt,
    computedAt,
  };
}

export interface TripEntitlementsRow {
  readonly tripId: string;
  readonly boostActive: boolean;
  readonly seatCap: number;
  /** `Infinity` for an unlimited trip (converted from `REDRAFT_LIMIT_SENTINEL`). */
  readonly redraftLimit: number;
  readonly liveMap: boolean;
  /** The trip-only half of `sponsored(u,t) = ¬passPlus(u) ∧ ¬boostActive(t)`: `!boostActive`, i.e.
   * the answer for a viewer with no Pass+ of their own. A reader combines this with that specific
   * viewer's own `user_entitlements.pass_plus` (`tripRow.sponsored && !viewerPassPlus`) to get the
   * true per-viewer answer — `sponsored` genuinely depends on the viewer, not the trip alone, and a
   * materialised trip row can only ever store one shared value. */
  readonly sponsored: boolean;
  readonly computedAt: Date;
}

/**
 * Resolves `tripId`'s trip-scoped capabilities from every registered `TripSourceLoader`, writes
 * `trip_entitlements`, mirrors `seat_cap`/`redraft_limit` onto the `trips` row itself (existing
 * columns from the core schema; kept in sync here rather than duplicated), and notifies every active
 * crew member on `user:#uid` (there is no trip-scoped realtime namespace for entitlement changes).
 */
export async function recomputeTrip(
  tx: pg.PoolClient,
  tripId: string,
  clock: Clock = systemClock,
): Promise<TripEntitlementsRow> {
  const { rows: tripRows } = await tx.query<{ crew_id: string }>(
    'SELECT crew_id FROM trips WHERE id = $1',
    [tripId],
  );
  const tripRow = tripRows[0];
  if (tripRow === undefined) throw new Error(`recomputeTrip: no trip ${tripId}`);
  const crewId = tripRow.crew_id;

  const sources = await loadTripSources({ tx, tripId, crewId });
  const capabilities: TripCapabilities = resolveTripCapabilities(sources, tripId, crewId, clock);
  const computedAt = clock.now();
  const storedRedraftLimit = toStoredRedraftLimit(capabilities.redraftLimit);
  // sponsored(false, boostActive) = !boostActive: the trip-only baseline documented on
  // TripEntitlementsRow#sponsored above.
  const sponsoredBaseline = !capabilities.boostActive;

  await tx.query(
    `INSERT INTO trip_entitlements (trip_id, boost_active, seat_cap, redraft_limit, live_map, sponsored, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (trip_id) DO UPDATE SET
       boost_active = EXCLUDED.boost_active, seat_cap = EXCLUDED.seat_cap,
       redraft_limit = EXCLUDED.redraft_limit, live_map = EXCLUDED.live_map,
       sponsored = EXCLUDED.sponsored, computed_at = EXCLUDED.computed_at`,
    [
      tripId,
      capabilities.boostActive,
      capabilities.seatCap,
      storedRedraftLimit,
      capabilities.liveMap,
      sponsoredBaseline,
      computedAt,
    ],
  );
  await tx.query('UPDATE trips SET seat_cap = $2, redraft_limit = $3 WHERE id = $1', [
    tripId,
    capabilities.seatCap,
    storedRedraftLimit,
  ]);

  const memberUids = await crewMemberUids(tx, crewId);
  await notifyTripEntitlementChanged(tx, memberUids);

  return {
    tripId,
    boostActive: capabilities.boostActive,
    seatCap: capabilities.seatCap,
    redraftLimit: capabilities.redraftLimit,
    liveMap: capabilities.liveMap,
    sponsored: sponsoredBaseline,
    computedAt,
  };
}
