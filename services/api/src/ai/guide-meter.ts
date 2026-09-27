/**
 * The guide meter over Postgres (docs/product-decisions.md §3): free users get 30 guide answers a
 * day, reset at 00:00 device time, reserved through `entitle()` (`app.consume_quota` on
 * `usage_counters`) before the stream opens; Pass+ or a boosted trip is unmetered but counted
 * against the silent fair-use cap (`app.bump_fair_use`). Every step runs as the asking user, and
 * settling writes `usage.changed` to `user:#uid` through `rt_outbox` in the same transaction as
 * the count it reports.
 */
import type { MeterHandle, MeterReservation, UsageSnapshot } from '@cp/ai';
import { outbox, withUser } from '@cp/db';
import { rtUsageChangedSchema, userChannel } from '@cp/domain';
import { fairUseDecision } from '@cp/entitlements';
import type pg from 'pg';

import { entitle, releaseQuota, type QuotaReservation } from '../entitlements';

/** Free guide answers per device-local day. */
export const GUIDE_FREE_DAILY_LIMIT = 30;
/** Silent daily cap on unlimited tiers, one unit per guide turn. */
export const GUIDE_FAIR_USE_DAILY_CAP = 300;

const METRIC = 'guide_answers';
/** fair_use_counters metric the guide turn cap is kept under. */
const FAIR_USE_METRIC = 'guide_tokens';

export interface GuideMeterRequest {
  readonly uid: string;
  readonly device: string;
  /** IANA zone from `X-CP-TZ`; the free meter resets at midnight here. */
  readonly deviceTz: string;
  readonly tripId: string | null;
  readonly isCrewChat?: boolean;
  /** Crew members with Pass+ (crew chat): any one of them makes the ask unmetered. */
  readonly crewPassHolders?: readonly string[];
  readonly now?: Date;
}

interface CounterRow {
  readonly count: number;
  readonly limit_at_time: number;
  readonly reset_at: Date;
}

async function readUsage(tx: pg.PoolClient, reservation: QuotaReservation): Promise<UsageSnapshot> {
  const { rows } = await tx.query<CounterRow>(
    `SELECT count, limit_at_time, reset_at FROM usage_counters
     WHERE subject_kind = $1 AND subject_id = $2 AND metric = $3 AND period_key = $4`,
    [reservation.subjectKind, reservation.subjectId, reservation.metric, reservation.periodKey],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('guide meter: reserved usage row not found');
  return { used: row.count, limit: row.limit_at_time, reset_at: row.reset_at.toISOString() };
}

async function askerUnlimited(
  tx: pg.PoolClient,
  uid: string,
  tripId: string | null,
): Promise<boolean> {
  const { rows } = await tx.query<{ unlimited: boolean }>(
    `SELECT coalesce((SELECT guide_unlimited_global FROM user_entitlements WHERE user_id = $1), false)
         OR coalesce((SELECT boost_active FROM trip_entitlements WHERE trip_id = $2), false)
       AS unlimited`,
    [uid, tripId],
  );
  return rows[0]?.unlimited ?? false;
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function notify(tx: pg.PoolClient, uid: string, usage: UsageSnapshot): Promise<void> {
  await outbox(
    tx,
    userChannel(uid),
    'usage.changed',
    rtUsageChangedSchema.parse({ metric: METRIC, ...usage }),
  );
}

/**
 * Reserves one guide answer. Throws `DomainError('QUOTA_EXHAUSTED')` (detail carries `resetAt`, the
 * next device-local midnight) when the free meter is spent; nothing is counted in that case.
 */
export async function reserveGuideTurn(
  pool: pg.Pool,
  request: GuideMeterRequest,
): Promise<MeterHandle> {
  const now = request.now ?? new Date();
  const reserved = await withUser(pool, request.uid, request.device, async (tx) => {
    const unlimited = await askerUnlimited(tx, request.uid, request.tripId);
    const quota = await entitle(
      tx,
      { uid: request.uid, deviceTz: request.deviceTz, now },
      {
        kind: 'quota',
        metric: METRIC,
        limit: GUIDE_FREE_DAILY_LIMIT,
        askerGuideUnlimited: unlimited,
        isCrewChat: request.isCrewChat ?? false,
        ...(request.crewPassHolders === undefined
          ? {}
          : { crewPassHolders: request.crewPassHolders }),
      },
    );
    if (quota !== undefined) {
      const reservation: MeterReservation = {
        metered: true,
        fairUse: 'ok',
        usage: await readUsage(tx, quota),
      };
      return { quota, reservation };
    }
    const { rows } = await tx.query<{ bump: { count: number; cap: number } }>(
      'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump',
      [request.uid, FAIR_USE_METRIC, utcDayStart(now), GUIDE_FAIR_USE_DAILY_CAP],
    );
    const bump = rows[0]?.bump;
    const fairUse = bump === undefined ? 'ok' : fairUseDecision(bump.count, bump.cap);
    const reservation: MeterReservation = { metered: false, fairUse, usage: null };
    return { quota: undefined, reservation };
  });

  const { quota, reservation } = reserved;
  return {
    reservation,
    async commit() {
      if (quota === undefined) return { usage: null };
      return withUser(pool, request.uid, request.device, async (tx) => {
        const usage = await readUsage(tx, quota);
        await notify(tx, request.uid, usage);
        return { usage };
      });
    },
    async release() {
      if (quota === undefined) return { usage: null };
      return withUser(pool, request.uid, request.device, async (tx) => {
        await releaseQuota(tx, quota);
        const usage = await readUsage(tx, quota);
        await notify(tx, request.uid, usage);
        return { usage };
      });
    },
  };
}
