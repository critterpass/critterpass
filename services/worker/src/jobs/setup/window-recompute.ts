/**
 * `setup.window_recompute` (docs/api-contracts-async.md §2.2, doc delta): after a member's days
 * change, a calendar syncs, an ask is answered or someone joins or leaves, the trip's per-date
 * counts are recounted and its date window options rewritten, both as the server. Option rows keep
 * their ids by position, and an ask's outcome stays on its option while the same member and week
 * are still the ask. The crew gets counts on `trip_setup:`; never a member's day.
 */
import { outbox, withSystem } from '@cp/db';
import {
  AVAILABILITY_HORIZON_DAYS,
  channelName,
  SETUP_INPUT_STATUSES,
  SETUP_QUEUES,
  SETUP_RT,
  type TripStatus,
} from '@cp/domain';
import {
  addDays,
  windowInputFrom,
  windowOptions,
  type SetupWindowSource,
  type WindowOption,
} from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

export const windowRecomputeSchema = z.object({ trip_id: z.uuid() });
export type WindowRecomputeJob = z.infer<typeof windowRecomputeSchema>;

const DEFAULT_LENGTH_DAYS = 7;

export function todayIn(tz: string | null, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

interface ExistingOption {
  readonly position: number;
  readonly kind: string;
  readonly ask_user_id: string | null;
  readonly start_date: string;
  readonly end_date: string;
  readonly ask_status: string | null;
}

async function writeOptions(
  tx: pg.PoolClient,
  tripId: string,
  options: readonly WindowOption[],
): Promise<void> {
  const { rows } = await tx.query<ExistingOption>(
    `SELECT position, kind, ask_user_id, start_date::text AS start_date, end_date::text AS end_date,
            ask_status
       FROM date_window_options WHERE trip_id = $1`,
    [tripId],
  );
  for (const option of options) {
    const before = rows.find((row) => row.position === option.position);
    const sameAsk =
      before !== undefined &&
      option.kind === 'ask_first' &&
      before.kind === 'ask_first' &&
      before.ask_user_id === option.askUserId &&
      before.start_date === option.start &&
      before.end_date === option.end;
    await tx.query(
      `INSERT INTO date_window_options (trip_id, position, kind, start_date, end_date, free_count,
         member_count, missing_member_ids, missed_must_do_ids, ask_user_id, ask_status,
         price_delta_minor, currency, season_score, reason, is_pick, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
       ON CONFLICT (trip_id, position) DO UPDATE SET
         kind = EXCLUDED.kind, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
         free_count = EXCLUDED.free_count, member_count = EXCLUDED.member_count,
         missing_member_ids = EXCLUDED.missing_member_ids,
         missed_must_do_ids = EXCLUDED.missed_must_do_ids, ask_user_id = EXCLUDED.ask_user_id,
         ask_status = EXCLUDED.ask_status, price_delta_minor = EXCLUDED.price_delta_minor,
         currency = EXCLUDED.currency, season_score = EXCLUDED.season_score,
         reason = EXCLUDED.reason, is_pick = EXCLUDED.is_pick, computed_at = now()`,
      [
        tripId,
        option.position,
        option.kind,
        option.start,
        option.end,
        option.freeCount,
        option.memberCount,
        option.missingMemberIds,
        option.missedMustDoIds,
        option.askUserId,
        sameAsk ? before.ask_status : null,
        option.priceDeltaMinor === null ? null : option.priceDeltaMinor.toString(),
        option.priceDeltaMinor === null ? null : 'USD',
        option.seasonScore,
        option.reason,
        option.isPick,
      ],
    );
  }
  await tx.query('DELETE FROM date_window_options WHERE trip_id = $1 AND position >= $2', [
    tripId,
    options.length,
  ]);
}

export interface WindowRecomputeOutcome {
  readonly outcome: 'recomputed' | 'closed' | 'missing';
  readonly dates?: number;
  readonly options?: number;
}

export async function recomputeWindows(
  pool: pg.Pool,
  tripId: string,
  now: Date = new Date(),
): Promise<WindowRecomputeOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      status: TripStatus;
      tz: string | null;
      trip_length_days: number | null;
    }>(
      `SELECT t.status, coalesce(t.tz, d.tz) AS tz, t.trip_length_days
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
      [tripId],
    );
    const trip = rows[0];
    if (trip === undefined) return { outcome: 'missing' };
    if (!SETUP_INPUT_STATUSES.includes(trip.status)) return { outcome: 'closed' };
    const counted = await tx.query<{ kept: number }>(
      'SELECT app.recompute_availability($1) AS kept',
      [tripId],
    );
    const today = todayIn(trip.tz, now);
    const inputs = await tx.query<{ inputs: SetupWindowSource }>(
      'SELECT app.setup_window_inputs($1, $2, $3) AS inputs',
      [tripId, today, addDays(today, AVAILABILITY_HORIZON_DAYS)],
    );
    const source = inputs.rows[0]?.inputs;
    if (source === undefined) return { outcome: 'missing' };
    const options = windowOptions(
      windowInputFrom(source, {
        lengthDays: trip.trip_length_days ?? DEFAULT_LENGTH_DAYS,
        from: today,
        horizonDays: AVAILABILITY_HORIZON_DAYS,
      }),
    );
    await writeOptions(tx, tripId, options);
    const channel = channelName('trip_setup', tripId);
    const synced = source.members.filter((m) => Object.keys(m.days).length > 0).length;
    const dates = counted.rows[0]?.kept ?? 0;
    await outbox(tx, channel, SETUP_RT.syncCount, { synced, of: source.members.length });
    await outbox(tx, channel, SETUP_RT.availability, { dates });
    await outbox(tx, channel, SETUP_RT.windows, { options: options.length });
    return { outcome: 'recomputed', dates, options: options.length };
  });
}

export function windowRecomputeJob(): JobDefinition<WindowRecomputeJob> {
  return defineJob({
    queue: SETUP_QUEUES.windowRecompute,
    schema: windowRecomputeSchema,
    singletonKey: (data) => data.trip_id,
    handler: async (data, ctx) => ({ ...(await recomputeWindows(ctx.pool, data.trip_id)) }),
  });
}
