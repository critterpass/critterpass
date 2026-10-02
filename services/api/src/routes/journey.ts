/**
 * `POST /v1/trips/{id}/journey-check` (docs/api-contracts-disruptions.md): while a member is on
 * the way to a plan item, their phone sends where it is once a minute and the server answers with
 * the routed ETA. The position is used for that route and dropped: only the ETA, the minutes late
 * and the two streaks are kept (`journey_checks`, one row per member and item).
 * An ETA ten or more minutes past the time to be there, twice in a row, opens the item's
 * running-late disruption; three minutes or less, twice in a row, takes the member out of it
 * again. A single check either way changes nothing (an ETA flapping around the threshold).
 */
import { withUser } from '@cp/db';
import {
  DomainError,
  journeyCheckBodySchema,
  journeyCheckResultSchema,
  LATE_STREAK_CHECKS,
  LATE_THRESHOLD_MIN,
  nextJourneyStreaks,
  type JourneyCheckBody,
  type JourneyCheckResult,
  type JourneyMode,
  type RouteEtaProvider,
  type TravelMode,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import {
  checkRateLimit,
  type RateLimitRedisClient,
  type RateLimitRule,
} from '../abuse/rate-limits';
import { asSystemRole } from '../admin/command';
import type { AppEnv } from '../app';
import {
  beThereAt,
  clearLate,
  lateItem,
  recordLate,
  type LateItem,
} from '../commands/disruptions/late-detect';
import { ErrorBodySchema, validationHook } from '../commands/_framework/doors';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

const MIN = 60_000;
const MAX_LATE_MIN = 1440;

/** The phone checks once a minute; a second check inside half a minute is refused. */
export const JOURNEY_CHECK_RULE: RateLimitRule = { windowSeconds: 30, max: 1 };

const TRAVEL_MODE: Readonly<Record<JourneyMode, TravelMode>> = {
  drive: 'auto',
  transfer: 'auto',
  scooter: 'motor_scooter',
  walk: 'pedestrian',
};

export interface JourneyRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly routing: RouteEtaProvider;
  readonly now?: () => Date;
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const journeyCheckRoute = createRoute({
  method: 'post',
  path: '/v1/trips/{id}/journey-check',
  tags: ['trip-day'],
  summary: 'ETA to a plan item from where the phone is; opens running late when it will be missed',
  request: {
    params: z.object({ id: z.uuid() }),
    body: { content: { 'application/json': { schema: journeyCheckBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The ETA and whether the member runs late',
      content: { 'application/json': { schema: journeyCheckResultSchema } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    403: errorResponse('NOT_ELIGIBLE: not going to this item, or it has no place to route to'),
    404: errorResponse('NOT_FOUND: no such item on the current plan'),
    429: errorResponse('RATE_LIMITED: one check per 30 seconds'),
  },
});

interface Routed {
  readonly etaAt: Date;
  readonly lateMin: number;
  readonly traffic: boolean;
  readonly estimate: boolean;
  readonly walkMin: number | null;
}

async function route(
  routing: RouteEtaProvider,
  item: LateItem & { lat: number; lng: number },
  body: JourneyCheckBody,
  now: Date,
): Promise<Routed> {
  const leg = { originLat: body.lat, originLng: body.lng, destLat: item.lat, destLng: item.lng };
  const eta = await routing.eta({ ...leg, mode: TRAVEL_MODE[body.mode] });
  const etaAt = new Date(now.getTime() + eta.minutes * MIN);
  const late = Math.round((etaAt.getTime() - beThereAt(item).getTime()) / MIN);
  const lateMin = Math.max(-MAX_LATE_MIN, Math.min(MAX_LATE_MIN, late));
  // Only a late ride is worth measuring on foot: the walk is an option, never the ETA.
  let walkMin: number | null = null;
  if (lateMin >= LATE_THRESHOLD_MIN && body.mode !== 'walk') {
    const walk = await routing.eta({ ...leg, mode: 'pedestrian' });
    walkMin = walk.estimate ? null : walk.minutes;
  }
  return { etaAt, lateMin, traffic: eta.traffic, estimate: eta.estimate, walkMin };
}

/** Keeps the check (never the position) and opens, joins or leaves the item's late party. */
async function keep(
  tx: pg.PoolClient,
  item: LateItem,
  uid: string,
  mode: JourneyMode,
  routed: Routed,
): Promise<JourneyCheckResult> {
  const previous = await tx.query<{ late_streak: number; on_time_streak: number }>(
    `SELECT late_streak, on_time_streak FROM journey_checks
      WHERE trip_id = $1 AND item_id = $2 AND user_id = $3 FOR UPDATE`,
    [item.trip_id, item.id, uid],
  );
  const streaks = nextJourneyStreaks(
    {
      lateStreak: previous.rows[0]?.late_streak ?? 0,
      onTimeStreak: previous.rows[0]?.on_time_streak ?? 0,
    },
    routed.lateMin,
  );
  let disruptionId: string | null = null;
  let status: JourneyCheckResult['status'] = 'on_time';
  if (streaks.lateStreak >= LATE_STREAK_CHECKS) {
    const late = await recordLate(tx, item, {
      uid,
      lateMin: routed.lateMin,
      etaAt: routed.etaAt,
      mode,
      walkMin: routed.walkMin,
      cause: 'traffic',
    });
    disruptionId = late.disruptionId;
    status = 'late';
  } else if (streaks.onTimeStreak >= LATE_STREAK_CHECKS) {
    if (await clearLate(tx, item, uid)) status = 'resolved';
  } else {
    // Between the two: whatever is open stays open, and a member in it is still late.
    const open = await tx.query<{ id: string }>(
      `SELECT id FROM disruptions
        WHERE trip_id = $1 AND dedupe_key = $2 AND status = 'open'
          AND affected -> 'traveller_ids' ? $3`,
      [item.trip_id, `late:${item.stable_id}`, uid],
    );
    disruptionId = open.rows[0]?.id ?? null;
    if (disruptionId !== null) status = 'late';
  }
  await tx.query(
    `INSERT INTO journey_checks (trip_id, item_id, user_id, mode, eta_at, late_min, late_streak,
       on_time_streak, traffic, disruption_id, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (trip_id, item_id, user_id) DO UPDATE
       SET mode = EXCLUDED.mode, eta_at = EXCLUDED.eta_at, late_min = EXCLUDED.late_min,
           late_streak = EXCLUDED.late_streak, on_time_streak = EXCLUDED.on_time_streak,
           traffic = EXCLUDED.traffic, disruption_id = EXCLUDED.disruption_id,
           checked_at = EXCLUDED.checked_at`,
    [
      item.trip_id,
      item.id,
      uid,
      mode,
      routed.etaAt,
      routed.lateMin,
      streaks.lateStreak,
      streaks.onTimeStreak,
      routed.traffic,
      disruptionId,
    ],
  );
  return {
    eta_at: routed.etaAt.toISOString(),
    late_min: routed.lateMin,
    traffic: routed.traffic,
    estimate: routed.estimate,
    status,
    disruption_id: disruptionId,
  };
}

export function registerJourneyRoutes(app: OpenAPIHono<AppEnv>, deps: JourneyRouteDeps): void {
  const now = deps.now ?? (() => new Date());
  app.openapi(
    journeyCheckRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const tripId = c.req.valid('param').id;
      const body = c.req.valid('json');
      const limit = await checkRateLimit(deps.redis, `journey:${session.uid}`, JOURNEY_CHECK_RULE);
      if (!limit.allowed) {
        throw new DomainError('RATE_LIMITED', { retry_after_s: limit.retryAfterS });
      }
      const { item, onTrip } = await withUser(deps.pool, session.uid, '', async (tx) => {
        const travelling = await tx.query<{ on_trip: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM trip_participants
                           WHERE trip_id = $1 AND user_id = $2
                             AND rsvp NOT IN ('out', 'waitlisted')) AS on_trip`,
          [tripId, session.uid],
        );
        return {
          item: await lateItem(tx, tripId, body.item_id),
          onTrip: travelling.rows[0]?.on_trip === true,
        };
      });
      if (item === undefined) throw new DomainError('NOT_FOUND', { reason: 'item' });
      // Only a traveller on the trip, and only for an item they are going to.
      if (!onTrip) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_trip' });
      if (!item.attendee_ids.includes(session.uid)) {
        throw new DomainError('NOT_ELIGIBLE', { reason: 'not_attending' });
      }
      const { lat, lng } = item;
      if (lat === null || lng === null)
        throw new DomainError('NOT_ELIGIBLE', { reason: 'no_place' });
      // The route is asked outside any transaction; the position goes no further than this call.
      const routed = await route(deps.routing, { ...item, lat, lng }, body, now());
      const result = await withUser(deps.pool, session.uid, '', (tx) =>
        asSystemRole(tx, () => keep(tx, item, session.uid, body.mode, routed)),
      );
      return c.json(result, 200);
    },
    validationHook,
  );
}
