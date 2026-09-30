/**
 * The guide meter from the worker (docs/product-decisions.md §3): the same rules as the api's
 * guide turns, for the answers the worker gives (crew-chat mentions, queued questions). A free ask
 * reserves one unit through `app.consume_quota` as the asker; Pass+, a boosted trip or (in crew
 * chat) a crewmate with Pass+ make it unmetered, counted only against the silent fair-use cap.
 * Settling writes `usage.changed` to `user:#uid` in the same transaction as the count it reports.
 */
import type { MeterHandle, MeterReservation, UsageSnapshot } from '@cp/ai';
import { outbox, withUser } from '@cp/db';
import {
  DomainError,
  GUIDE_FAIR_USE_DAILY_CAP,
  GUIDE_FAIR_USE_METRIC,
  GUIDE_FREE_DAILY_LIMIT,
  GUIDE_METER_METRIC,
  guidePeriod,
  rtUsageChangedSchema,
  userChannel,
} from '@cp/domain';
import type pg from 'pg';

export interface WorkerMeterRequest {
  readonly uid: string;
  /** The asker's device zone: the free answers reset at its midnight. */
  readonly tz: string;
  readonly tripId: string | null;
  readonly isCrewChat: boolean;
  readonly crewPassHolders: readonly string[];
  readonly now?: Date;
}

interface Quota {
  readonly ok: boolean;
  readonly used: number;
  readonly limit: number;
  readonly reset_at: string;
  readonly period_key: string;
}

const DEVICE = 'worker';

async function readUsage(tx: pg.PoolClient, uid: string, key: string): Promise<UsageSnapshot> {
  const { rows } = await tx.query<{ count: number; limit_at_time: number; reset_at: Date }>(
    `SELECT count, limit_at_time, reset_at FROM usage_counters
      WHERE subject_kind = 'user' AND subject_id = $1 AND metric = $2 AND period_key = $3`,
    [uid, GUIDE_METER_METRIC, key],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('guide meter: reserved usage row not found');
  return { used: row.count, limit: row.limit_at_time, reset_at: row.reset_at.toISOString() };
}

async function notify(tx: pg.PoolClient, uid: string, usage: UsageSnapshot): Promise<void> {
  await outbox(
    tx,
    userChannel(uid),
    'usage.changed',
    rtUsageChangedSchema.parse({ metric: GUIDE_METER_METRIC, ...usage }),
  );
}

function fairUse(count: number, cap: number): MeterReservation['fairUse'] {
  if (count <= cap) return 'ok';
  return count === cap + 1 ? 'degrade_haiku' : 'busy';
}

/** Reserves one guide answer, or throws `QUOTA_EXHAUSTED` with nothing counted. */
export async function reserveGuideAnswer(
  pool: pg.Pool,
  request: WorkerMeterRequest,
): Promise<MeterHandle> {
  const now = request.now ?? new Date();
  const reserved = await withUser(pool, request.uid, DEVICE, async (tx) => {
    const { rows } = await tx.query<{ unlimited: boolean }>(
      `SELECT coalesce((SELECT guide_unlimited_global FROM user_entitlements WHERE user_id = $1), false)
           OR coalesce((SELECT boost_active FROM trip_entitlements WHERE trip_id = $2), false)
         AS unlimited`,
      [request.uid, request.tripId],
    );
    const unmetered =
      rows[0]?.unlimited === true || (request.isCrewChat && request.crewPassHolders.length > 0);
    if (unmetered) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const bump = await tx.query<{ bump: { count: number; cap: number } }>(
        'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump',
        [request.uid, GUIDE_FAIR_USE_METRIC, day, GUIDE_FAIR_USE_DAILY_CAP],
      );
      const counted = bump.rows[0]?.bump;
      const reservation: MeterReservation = {
        metered: false,
        fairUse: counted === undefined ? 'ok' : fairUse(counted.count, counted.cap),
        usage: null,
      };
      return { key: undefined, reservation };
    }
    const period = guidePeriod(now, request.tz);
    const quota = await tx.query<{ quota: Quota }>(
      "SELECT app.consume_quota('user', $1, $2, $3, $4, $5) AS quota",
      [request.uid, GUIDE_METER_METRIC, period.key, GUIDE_FREE_DAILY_LIMIT, period.resetAt],
    );
    const result = quota.rows[0]?.quota;
    if (result === undefined) throw new Error('guide meter: consume_quota returned nothing');
    if (!result.ok) {
      throw new DomainError('QUOTA_EXHAUSTED', {
        used: result.used,
        limit: result.limit,
        resetAt: new Date(result.reset_at).toISOString(),
      });
    }
    const usage = await readUsage(tx, request.uid, result.period_key);
    const reservation: MeterReservation = { metered: true, fairUse: 'ok', usage };
    return { key: result.period_key, reservation };
  });

  const { key, reservation } = reserved;
  const settle = (release: boolean) => async () => {
    if (key === undefined) return { usage: null };
    return withUser(pool, request.uid, DEVICE, async (tx) => {
      if (release) {
        await tx.query("SELECT app.release_quota('user', $1, $2, $3)", [
          request.uid,
          GUIDE_METER_METRIC,
          key,
        ]);
      }
      const usage = await readUsage(tx, request.uid, key);
      await notify(tx, request.uid, usage);
      return { usage };
    });
  };
  return { reservation, commit: settle(false), release: settle(true) };
}
