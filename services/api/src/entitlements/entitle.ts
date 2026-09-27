/**
 * `entitle(tx, ctx, requirement)` (docs/api-contracts.md §2.3 step 5: "quota reservations in same
 * tx; released on failure"). Every branch here only ever reads the already-materialised
 * `user_entitlements`/`trip_entitlements` rows (never re-resolves from raw sources — that is
 * `materialise.ts`'s job, run on recompute triggers, not on every command) and either returns
 * normally (optionally with a reservation a caller can later release) or throws a typed
 * `DomainError` a command handler surfaces to the client as-is.
 */
import {
  DomainError,
  type CapabilityKey,
  type EntitlementSubjectKind,
  type SeatLimitOffer,
  type UsageMetric,
} from '@cp/domain';
import {
  guideMeterSubject,
  periodKey,
  periodResetAt,
  quotaDecision,
  redraftReservationDecision,
} from '@cp/entitlements';
import type pg from 'pg';

import { fromStoredRedraftLimit } from './materialise';

interface ConsumeQuotaResult {
  readonly ok: boolean;
  readonly used: number;
  readonly limit: number;
  readonly reset_at: string;
  readonly period_key: string;
}

async function consumeQuota(
  tx: pg.PoolClient,
  subjectKind: EntitlementSubjectKind,
  subjectId: string,
  metric: string,
  key: string,
  limit: number,
  resetAt: Date,
): Promise<ConsumeQuotaResult> {
  const { rows } = await tx.query<{ consume_quota: ConsumeQuotaResult }>(
    'SELECT app.consume_quota($1, $2, $3, $4, $5, $6) AS consume_quota',
    [subjectKind, subjectId, metric, key, limit, resetAt],
  );
  const result = rows[0]?.consume_quota;
  if (result === undefined) throw new Error('app.consume_quota returned no row');
  return result;
}

export interface QuotaReservation {
  readonly subjectKind: EntitlementSubjectKind;
  readonly subjectId: string;
  readonly metric: string;
  readonly periodKey: string;
}

/** Undoes one `entitle()` quota/redraft reservation ("reserve on submit, release on failure"): only ever needed
 * from a later transaction than the one that reserved it (that tx's own rollback already undoes a
 * reservation that never left it) — e.g. an async redraft job's failure handler. */
export async function releaseQuota(
  tx: pg.PoolClient,
  reservation: QuotaReservation,
): Promise<void> {
  await tx.query('SELECT app.release_quota($1, $2, $3, $4)', [
    reservation.subjectKind,
    reservation.subjectId,
    reservation.metric,
    reservation.periodKey,
  ]);
}

export interface QuotaRequirement {
  readonly kind: 'quota';
  readonly metric: UsageMetric;
  readonly limit: number;
  readonly isSystemWork?: boolean;
  readonly askerGuideUnlimited?: boolean;
  readonly isCrewChat?: boolean;
  /** Other crew members whose Pass+ exempts a crew-chat ask (docs/product-decisions.md §3), and the
   * hint list `QUOTA_EXHAUSTED` carries back on rejection. */
  readonly crewPassHolders?: readonly string[];
}

async function reserveQuota(
  tx: pg.PoolClient,
  ctx: EntitleContext,
  req: QuotaRequirement,
): Promise<QuotaReservation | undefined> {
  const subject = guideMeterSubject({
    isSystemWork: req.isSystemWork ?? false,
    askerGuideUnlimited: req.askerGuideUnlimited ?? false,
    isCrewChat: req.isCrewChat ?? false,
    // Conditional spread, not `crewPassHolders: req.crewPassHolders`: exactOptionalPropertyTypes
    // treats an explicit `undefined` value differently from an absent key.
    ...(req.crewPassHolders !== undefined ? { crewPassHolders: req.crewPassHolders } : {}),
  });
  if (!subject.metered) return undefined;

  const now = ctx.now ?? new Date();
  const key = periodKey(now, ctx.deviceTz);
  const resetAt = periodResetAt(key, ctx.deviceTz);
  const result = await consumeQuota(tx, 'user', ctx.uid, req.metric, key, req.limit, resetAt);

  if (!result.ok) {
    const decision = quotaDecision(
      { used: result.used, limit: result.limit, resetAt: result.reset_at },
      req.crewPassHolders,
    );
    if (decision.ok) {
      // Unreachable in practice: consume_quota only reports ok:false when used === limit, which
      // quotaDecision's used < limit check also always rejects. A real guard, not an assertion.
      throw new Error('entitle: consume_quota and quotaDecision disagree on quota exhaustion');
    }
    throw new DomainError('QUOTA_EXHAUSTED', decision.detail);
  }

  return {
    subjectKind: 'user',
    subjectId: ctx.uid,
    metric: req.metric,
    periodKey: result.period_key,
  };
}

export interface CapabilityRequirement {
  readonly kind: 'capability';
  /** `help_map` is session-based, not entitlement-based (docs/product-decisions.md §3
   * `helpMap(u,t)`) — call `helpMap()` from `@cp/entitlements` directly with the caller's own
   * Help/SOS session lookup instead of routing it through here. */
  readonly key: Exclude<CapabilityKey, 'help_map'>;
  /** Required for `boost_active`/`live_map`; used as a secondary check for `guide_unlimited`
   * (`passPlus(u) OR boostActive(t)`); ignored by the remaining (user-only) keys. */
  readonly tripId?: string;
}

async function lookupOffers(tx: pg.PoolClient, key: CapabilityKey): Promise<readonly string[]> {
  const { rows } = await tx.query<{ key: string }>(
    'SELECT key FROM products WHERE grants @> $1::jsonb ORDER BY key',
    [JSON.stringify([key])],
  );
  return rows.map((row) => row.key);
}

async function checkCapability(
  tx: pg.PoolClient,
  ctx: EntitleContext,
  req: CapabilityRequirement,
): Promise<void> {
  let granted: boolean;

  switch (req.key) {
    case 'boost_active': {
      if (req.tripId === undefined) {
        throw new Error('entitle: capability "boost_active" requires a tripId');
      }
      const { rows } = await tx.query<{ boost_active: boolean }>(
        'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
        [req.tripId],
      );
      granted = rows[0]?.boost_active ?? false;
      break;
    }
    case 'live_map': {
      if (req.tripId === undefined) {
        throw new Error('entitle: capability "live_map" requires a tripId');
      }
      const { rows } = await tx.query<{ live_map: boolean }>(
        'SELECT live_map FROM trip_entitlements WHERE trip_id = $1',
        [req.tripId],
      );
      granted = rows[0]?.live_map ?? false;
      break;
    }
    case 'guide_unlimited': {
      const { rows } = await tx.query<{ guide_unlimited_global: boolean }>(
        'SELECT guide_unlimited_global FROM user_entitlements WHERE user_id = $1',
        [ctx.uid],
      );
      granted = rows[0]?.guide_unlimited_global ?? false;
      if (!granted && req.tripId !== undefined) {
        const { rows: tripRows } = await tx.query<{ boost_active: boolean }>(
          'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
          [req.tripId],
        );
        granted = tripRows[0]?.boost_active ?? false;
      }
      break;
    }
    case 'pass_plus':
    case 'icon_styles_all':
    case 'next_flight_widget':
    case 'mailbox_import':
    case 'spoken_readout':
    case 'printed_postcard_sender': {
      const { rows } = await tx.query<{ pass_plus: boolean }>(
        'SELECT pass_plus FROM user_entitlements WHERE user_id = $1',
        [ctx.uid],
      );
      granted = rows[0]?.pass_plus ?? false;
      break;
    }
  }

  if (granted) return;
  const offers = await lookupOffers(tx, req.key);
  throw new DomainError('ENTITLEMENT_REQUIRED', { perk: req.key, offers });
}

export interface SeatRequirement {
  readonly kind: 'seat';
  readonly tripId: string;
}

async function checkSeat(tx: pg.PoolClient, req: SeatRequirement): Promise<void> {
  const { rows } = await tx.query<{ seat_cap: number; boost_active: boolean }>(
    'SELECT seat_cap, boost_active FROM trip_entitlements WHERE trip_id = $1',
    [req.tripId],
  );
  // No trip_entitlements row yet (never recomputed): fall back to the free-tier default rather than
  // failing closed on every seat check for a brand-new trip.
  const seatCap = rows[0]?.seat_cap ?? 6;
  const boostActive = rows[0]?.boost_active ?? false;

  const { rows: heldRows } = await tx.query<{ trip_seats_held: number }>(
    'SELECT app.trip_seats_held($1) AS trip_seats_held',
    [req.tripId],
  );
  const held = heldRows[0]?.trip_seats_held ?? 0;
  if (held < seatCap) return;

  const offer: SeatLimitOffer = boostActive ? 'waitlist' : 'boost';
  throw new DomainError('SEAT_LIMIT', { cap: seatCap, offer });
}

export interface RedraftRequirement {
  readonly kind: 'redraft';
  readonly tripId: string;
}

/** Redrafts have no daily reset (a per-trip lifetime cap, docs/product-decisions.md §3): one fixed
 * bucket per trip rather than a device-tz period_key, and a reset_at far enough out to never matter
 * (the NOT NULL column still needs a value; nothing ever reads it for this metric). */
const REDRAFT_LIFETIME_PERIOD_KEY = 'lifetime';
const REDRAFT_NEVER_RESETS_AT = new Date('9999-12-31T23:59:59.000Z');

async function reserveRedraft(
  tx: pg.PoolClient,
  req: RedraftRequirement,
): Promise<QuotaReservation | undefined> {
  const { rows } = await tx.query<{ redraft_limit: number }>(
    'SELECT redraft_limit FROM trip_entitlements WHERE trip_id = $1',
    [req.tripId],
  );
  const limit = fromStoredRedraftLimit(rows[0]?.redraft_limit ?? 3);
  if (limit === Infinity) {
    // Boost/FTF/crew-year: no visible cap to reserve against. Fair-use throttling for these trips is
    // a separate, silent mechanism (packages/entitlements/src/fair-use.ts) wired by whichever
    // surface actually submits redrafts.
    return undefined;
  }

  const result = await consumeQuota(
    tx,
    'trip',
    req.tripId,
    'redrafts',
    REDRAFT_LIFETIME_PERIOD_KEY,
    limit,
    REDRAFT_NEVER_RESETS_AT,
  );
  if (!result.ok) {
    const decision = redraftReservationDecision(result.used, limit);
    if (decision.ok) {
      throw new Error('entitle: consume_quota and redraftReservationDecision disagree');
    }
    throw new DomainError('REDRAFT_LIMIT', decision.detail);
  }

  return {
    subjectKind: 'trip',
    subjectId: req.tripId,
    metric: 'redrafts',
    periodKey: result.period_key,
  };
}

export interface EntitleContext {
  readonly uid: string;
  /** IANA time zone from the command envelope's `device.tz` (docs/api-contracts.md §2.1). */
  readonly deviceTz: string;
  /** Overridable for tests; defaults to the real instant. */
  readonly now?: Date;
}

export type EntitleRequirement =
  QuotaRequirement | CapabilityRequirement | SeatRequirement | RedraftRequirement;

/**
 * Checks (and where applicable reserves) `requirement` inside the caller's transaction. Resolves to
 * a `QuotaReservation` for a metered `quota`/`redraft` requirement (`undefined` if it was exempt or
 * unlimited), or `undefined` for `capability`/`seat` (nothing ongoing to release). Throws
 * `DomainError` (`QUOTA_EXHAUSTED` / `REDRAFT_LIMIT` / `SEAT_LIMIT` / `ENTITLEMENT_REQUIRED`) on
 * failure — a caller never needs to inspect a boolean, only catch.
 */
export async function entitle(
  tx: pg.PoolClient,
  ctx: EntitleContext,
  requirement: EntitleRequirement,
): Promise<QuotaReservation | undefined> {
  switch (requirement.kind) {
    case 'quota':
      return reserveQuota(tx, ctx, requirement);
    case 'capability':
      await checkCapability(tx, ctx, requirement);
      return undefined;
    case 'seat':
      await checkSeat(tx, requirement);
      return undefined;
    case 'redraft':
      return reserveRedraft(tx, requirement);
  }
}
