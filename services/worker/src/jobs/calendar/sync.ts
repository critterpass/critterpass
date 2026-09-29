/**
 * `calendar.sync` (docs/api-contracts-async.md §2.2, doc delta): one connected calendar's free/busy
 * over the setup horizon, reduced to date-level days in the member's own zone and written as their
 * `oauth` days. A day the member marked by hand is never overwritten, and a device-calendar day
 * keeps whichever of the two is busier. The access token is refreshed when due and re-sealed; a
 * revoked grant marks the source `error` (the app offers to reconnect) instead of retrying. The
 * member's trips are recounted afterwards. Queued on connect, on setup open and daily.
 */
import { sendInTx, withSystem } from '@cp/db';
import {
  AVAILABILITY_HORIZON_DAYS,
  reduceToDays,
  SETUP_QUEUES,
  localDateOf,
  type OAuthCalendarProvider,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import {
  CalendarGrantRevoked,
  openTokens,
  readBusy,
  refreshTokens,
  sealTokens,
  type CalendarSyncConfig,
  type StoredTokens,
} from './providers';

export const calendarSyncSchema = z.object({ source_id: z.uuid() });
export type CalendarSyncJob = z.infer<typeof calendarSyncSchema>;

const PROVIDER_OF: Readonly<Record<string, OAuthCalendarProvider>> = {
  oauth_google: 'google',
  oauth_microsoft: 'microsoft',
};
const SEVERITY = { free: 0, maybe: 1, busy: 2 } as const;
const REFRESH_MARGIN_MS = 60_000;

export type CalendarSyncOutcome = 'synced' | 'inactive' | 'revoked' | 'unconfigured';

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export async function syncCalendarSource(
  pool: pg.Pool,
  sourceId: string,
  config: CalendarSyncConfig | undefined,
  now: Date = new Date(),
): Promise<{ outcome: CalendarSyncOutcome; days?: number }> {
  const source = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      user_id: string;
      kind: string;
      oauth_tokens_enc: string | null;
      consent_tentative: boolean;
      status: string;
      tz: string | null;
    }>(
      `SELECT s.user_id, s.kind, s.oauth_tokens_enc, s.consent_tentative, s.status, u.tz
         FROM calendar_sources s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
      [sourceId],
    );
    return rows[0];
  });
  const provider = source === undefined ? undefined : PROVIDER_OF[source.kind];
  if (source === undefined || provider === undefined || source.status === 'disconnected') {
    return { outcome: 'inactive' };
  }
  if (source.oauth_tokens_enc === null) return { outcome: 'inactive' };
  if (config === undefined) return { outcome: 'unconfigured' };
  let tokens: StoredTokens = openTokens(source.oauth_tokens_enc, config.keyring);
  const tz = source.tz ?? 'UTC';
  const from = localDateOf(now, tz);
  const to = addDays(from, AVAILABILITY_HORIZON_DAYS);
  let days: Map<string, 'free' | 'maybe' | 'busy'>;
  try {
    if (Date.parse(tokens.expires_at) - REFRESH_MARGIN_MS <= now.getTime()) {
      tokens = await refreshTokens(config, provider, tokens, now);
    }
    const intervals = await readBusy(
      config,
      provider,
      tokens.access_token,
      new Date(`${addDays(from, -1)}T00:00:00Z`),
      new Date(`${addDays(to, 2)}T00:00:00Z`),
    );
    days = reduceToDays(intervals, { from, to, tz, includeTentative: source.consent_tentative });
  } catch (error) {
    if (!(error instanceof CalendarGrantRevoked)) throw error;
    await withSystem(pool, (tx) =>
      tx.query("UPDATE calendar_sources SET status = 'error' WHERE id = $1", [sourceId]),
    );
    return { outcome: 'revoked' };
  }
  await withSystem(pool, async (tx) => {
    const existing = await tx.query<{ date: string; state: string; source: string }>(
      `SELECT date::text AS date, state, source FROM calendar_days
        WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [source.user_id, from, to],
    );
    const before = new Map(existing.rows.map((row) => [row.date, row]));
    for (const [date, state] of days) {
      const prior = before.get(date);
      if (prior?.source === 'manual') continue;
      if (
        prior?.source === 'device_cal' &&
        (SEVERITY[prior.state as keyof typeof SEVERITY] ?? 0) >= SEVERITY[state]
      ) {
        continue;
      }
      await tx.query(
        `INSERT INTO calendar_days (user_id, date, state, source, guide_may_ask)
         VALUES ($1, $2, $3, 'oauth', $4)
         ON CONFLICT (user_id, date) DO UPDATE
           SET state = EXCLUDED.state, source = 'oauth', guide_may_ask = EXCLUDED.guide_may_ask`,
        [source.user_id, date, state, state === 'maybe'],
      );
    }
    await tx.query(
      `UPDATE calendar_sources
          SET oauth_tokens_enc = $2, token_expires_at = $3, last_sync_at = $4, status = 'active'
        WHERE id = $1`,
      [sourceId, sealTokens(tokens, config.keyring), tokens.expires_at, now],
    );
    const trips = await tx.query<{ id: string }>(
      `SELECT t.id FROM trips t
         JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = $1 AND m.status = 'active'
        WHERE t.status IN ('won', 'setup') AND $1 IN (SELECT app.setup_member_ids(t.id))`,
      [source.user_id],
    );
    for (const trip of trips.rows) {
      await sendInTx(
        tx,
        SETUP_QUEUES.windowRecompute,
        { trip_id: trip.id },
        {
          singletonKey: trip.id,
        },
      );
    }
  });
  return { outcome: 'synced', days: days.size };
}

export function calendarSyncJob(
  config: CalendarSyncConfig | undefined,
): JobDefinition<CalendarSyncJob> {
  return defineJob({
    queue: SETUP_QUEUES.calendarSync,
    schema: calendarSyncSchema,
    singletonKey: (data) => data.source_id,
    handler: async (data, ctx) => ({
      ...(await syncCalendarSource(ctx.pool, data.source_id, config)),
    }),
  });
}
