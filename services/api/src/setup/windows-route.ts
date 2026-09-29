/**
 * `GET /v1/setup/{trip_id}/windows?length` (docs/api-contracts.md §5.5, doc delta): date window
 * options for a trip length other than the stored one (the organiser trying 5 days instead of 8),
 * computed on demand by the same engine and inputs as the recompute job. The caller must take part
 * in the trip's setup; members' days are read by the server only, and the answer carries derived
 * options and counts, never anyone's day.
 */
import { withUser } from '@cp/db';
import {
  AVAILABILITY_HORIZON_DAYS,
  DomainError,
  windowsQuerySchema,
  type WindowOptionWire,
  type WindowsResult,
} from '@cp/domain';
import { windowInputFrom, windowOptions, type SetupWindowSource } from '@cp/planner';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import { asSystemRole } from '../admin/command';
import type { AppEnv } from '../app';
import { requireSetupMember, todayIn, addDays } from '../commands/setup/shared';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export interface WindowsRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
}

const params = z.object({ trip_id: z.uuid() });
const DEFAULT_LENGTH_DAYS = 7;

/** The trip's window options for `lengthDays`, computed as the server from setup inputs. */
export async function computeWindows(
  tx: pg.PoolClient,
  tripId: string,
  lengthDays: number,
  today: string,
): Promise<{ options: WindowOptionWire[]; memberCount: number; syncedCount: number }> {
  const to = addDays(today, AVAILABILITY_HORIZON_DAYS);
  const source = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ inputs: SetupWindowSource }>(
      'SELECT app.setup_window_inputs($1, $2, $3) AS inputs',
      [tripId, today, to],
    );
    return rows[0]?.inputs;
  });
  if (source === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const options = windowOptions(
    windowInputFrom(source, { lengthDays, from: today, horizonDays: AVAILABILITY_HORIZON_DAYS }),
  );
  return {
    memberCount: source.members.length,
    syncedCount: source.members.filter((m) => Object.keys(m.days).length > 0).length,
    options: options.map((option) => ({
      kind: option.kind,
      start_date: option.start,
      end_date: option.end,
      free_count: option.freeCount,
      member_count: option.memberCount,
      missing_member_ids: option.missingMemberIds,
      missed_must_do_ids: option.missedMustDoIds,
      ask_user_id: option.askUserId,
      price_delta_minor: option.priceDeltaMinor === null ? null : Number(option.priceDeltaMinor),
      currency: option.priceDeltaMinor === null ? null : 'USD',
      season_score: option.seasonScore,
      reason: option.reason,
      is_pick: option.isPick,
    })),
  };
}

export function registerWindowsRoute(app: OpenAPIHono<AppEnv>, deps: WindowsRouteDeps): void {
  app.get('/v1/setup/:trip_id/windows', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { trip_id: tripId } = params.parse(c.req.param());
    const query = windowsQuerySchema.parse(c.req.query());
    const body = await withUser(
      deps.pool,
      session.uid,
      'unknown',
      async (tx): Promise<WindowsResult> => {
        const trip = await requireSetupMember(tx, tripId, session.uid);
        const length = query.length ?? trip.trip_length_days ?? DEFAULT_LENGTH_DAYS;
        const today = todayIn(trip.tz, new Date());
        const computed = await computeWindows(tx, tripId, length, today);
        return {
          trip_id: tripId,
          length_days: length,
          member_count: computed.memberCount,
          synced_count: computed.syncedCount,
          options: computed.options,
        };
      },
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
