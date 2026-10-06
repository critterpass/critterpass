/**
 * Sharing the plan with a driver: the crew's commands, the crew's read of its links and the
 * driver's replies (`GET /v1/trips/{tripId}/driver-plan-shares`), and the no-login page routes.
 * Links are sealed with the field keyring, so without it the feature stays off.
 */
import { withUser } from '@cp/db';
import type { DriverPlanShare, LinkEnvironment } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../../app';
import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { registerPublicDriverPlanRoutes } from '../../routes/public-driver-plans';
import type { FieldKeyring } from '../bookings/deps';
import type { CommandDoorDeps } from '../_framework/doors';
import { requireCommandSession } from '../_framework/session';
import { createDriverPlanShareCommands } from './commands';
import { toCrewShare, type ShareRow } from './store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** A driver's reply as the crew's review screen reads it. */
export interface CrewDriverReply {
  readonly id: string;
  readonly share_id: string;
  readonly status: string;
  readonly change_set_id: string | null;
  readonly price_per_day_minor: number | null;
  readonly currency: string | null;
  readonly includes: string[];
  readonly overtime_per_hour_minor: number | null;
  readonly included_hours: number | null;
  readonly car: string | null;
  readonly tips: unknown;
  readonly days: unknown;
  readonly created_at: string;
}

export interface DriverPlanRegistration {
  readonly app: OpenAPIHono<AppEnv>;
  readonly doors: CommandDoorDeps;
  readonly keyring: FieldKeyring | null | undefined;
  readonly appEnv: 'production' | 'staging' | 'local';
  readonly webProxySecret: string | undefined;
}

export function registerDriverPlanShares(input: DriverPlanRegistration): void {
  const { app, doors, keyring } = input;
  if (!keyring) {
    doors.logger.info('Driver plan links are off: FIELD_ENCRYPTION_KEYS is unset');
    return;
  }
  const linkEnv: LinkEnvironment = input.appEnv === 'local' ? 'development' : input.appEnv;
  const deps = { keyring, linkEnv };
  const commands = createDriverPlanShareCommands(deps);
  doors.registry.register(commands.create);
  doors.registry.register(commands.update);
  doors.registry.register(commands.revoke);
  registerPublicDriverPlanRoutes(app, {
    pool: doors.pool,
    redis: doors.redis,
    webProxySecret: input.webProxySecret,
  });

  app.get('/v1/trips/:tripId/driver-plan-shares', async (c) => {
    const { uid } = await requireCommandSession(doors.sessions, c.req.raw.headers);
    const tripId = c.req.param('tripId');
    if (!UUID.test(tripId)) return c.json({ shares: [], replies: [] }, 200);
    const now = new Date();
    const result = await withUser(doors.pool, uid, 'unknown', async (tx) => {
      await requireTripMember(tx, tripId);
      return asSystemRole(tx, async () => {
        const shares = await tx.query<ShareRow>(
          `SELECT id, trip_id, provider_id, driver_name, created_by, itinerary_version_id, day_nos,
                  token_enc, allow_quote, expires_at, revoked_at, open_count, last_opened_at,
                  pdf_key, pdf_version_id
             FROM driver_plan_shares WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [tripId],
        );
        const replies = await tx.query<
          Omit<
            CrewDriverReply,
            'created_at' | 'price_per_day_minor' | 'overtime_per_hour_minor'
          > & {
            created_at: Date;
            price_per_day_minor: string | null;
            overtime_per_hour_minor: string | null;
          }
        >(
          `SELECT id, share_id, status, change_set_id, price_per_day_minor, currency, includes,
                  overtime_per_hour_minor, included_hours, car, tips, days, created_at
             FROM driver_plan_replies WHERE trip_id = $1 AND status <> 'replaced'
            ORDER BY created_at DESC LIMIT 20`,
          [tripId],
        );
        const list: DriverPlanShare[] = shares.rows.map((row) => toCrewShare(row, deps, now));
        const crewReplies: CrewDriverReply[] = replies.rows.map((r) => ({
          ...r,
          price_per_day_minor:
            r.price_per_day_minor === null ? null : Number(r.price_per_day_minor),
          overtime_per_hour_minor:
            r.overtime_per_hour_minor === null ? null : Number(r.overtime_per_hour_minor),
          created_at: r.created_at.toISOString(),
        }));
        return { shares: list, replies: crewReplies };
      });
    });
    c.header('cache-control', 'private, no-store');
    return c.json(result, 200);
  });
}
