/**
 * `POST /v1/loc` (docs/api-contracts.md §5.2): the live location path for an open share (crew map,
 * Help, SOS). Fixes are validated against the caller's own active share, stored for minutes in
 * `location_fixes` (with their anti-spoof flags — a share fix is never rejected for them), and
 * published straight to Centrifugo for the crew (`trip_locations:{trip_id}`) and, for SOS, the
 * SOS channel (`sos:{share_id}`). It is the latency path: not the command outbox, not PowerSync.
 *
 * At most one batch per 5 s per user; SOS shares are exempt. A publish failure never fails the
 * request — the fixes are stored and the next batch carries the position again.
 */
import { withUser } from '@cp/db';
import {
  checkPlausibility,
  DomainError,
  generateUuidV7,
  locationBatchSchema,
  MOCK_FLAG_ACCESSORY,
  MOCK_FLAG_SIMULATED,
  type FixEvidence,
  type LocationFix,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import { checkRateLimit, type RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export type LocationPublisher = (channel: string, data: unknown) => Promise<void>;

export interface LocationRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  /** Absent = fixes are stored but not broadcast (no Centrifugo API configured). */
  readonly publish?: LocationPublisher;
  readonly onPublishError?: (error: unknown) => void;
}

export const LOC_PER_UID_RULE = { windowSeconds: 5, max: 1 };

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const locRoute = createRoute({
  method: 'post',
  path: '/v1/loc',
  tags: ['location'],
  summary: 'Publish live fixes for an open location share',
  request: {
    body: { required: true, content: { 'application/json': { schema: locationBatchSchema } } },
  },
  responses: {
    202: {
      description: 'Stored and broadcast',
      content: { 'application/json': { schema: z.object({ accepted: z.number().int() }) } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    403: errorResponse('FORBIDDEN: not your share, or the share is not open'),
    422: errorResponse('VALIDATION'),
    429: errorResponse('RATE_LIMITED'),
  },
});

interface ShareRow {
  readonly trip_id: string;
  readonly reason: 'crew_map' | 'help' | 'sos';
}

function evidenceOf(fix: LocationFix): FixEvidence {
  return {
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.acc,
    at: Date.parse(fix.at),
    simulated: (fix.mock & MOCK_FLAG_SIMULATED) !== 0,
    accessory: (fix.mock & MOCK_FLAG_ACCESSORY) !== 0,
  };
}

/** Oldest first, each fix's flags widened by the server's own speed/teleport check. */
export function flagBatch(fixes: readonly LocationFix[]): LocationFix[] {
  const ordered = [...fixes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let previous: FixEvidence | null = null;
  return ordered.map((fix) => {
    const evidence = evidenceOf(fix);
    const { flags } = checkPlausibility(previous, evidence);
    previous = evidence;
    return { ...fix, mock: fix.mock | flags };
  });
}

async function openShare(tx: pg.PoolClient, shareId: string, uid: string): Promise<ShareRow> {
  const { rows } = await tx.query<ShareRow & { active: boolean }>(
    `SELECT trip_id, reason, app.is_own_active_share(id) AS active
     FROM location_shares WHERE id = $1 AND user_id = $2`,
    [shareId, uid],
  );
  const row = rows[0];
  if (row?.active !== true) throw new DomainError('FORBIDDEN', { reason: 'share_not_open' });
  return row;
}

export function registerLocationRoute(app: OpenAPIHono<AppEnv>, deps: LocationRouteDeps): void {
  app.openapi(
    locRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const body = c.req.valid('json');
      const fixes = flagBatch(body.fixes);

      const share = await withUser(deps.pool, session.uid, '', async (tx) => {
        const row = await openShare(tx, body.share_id, session.uid);
        if (row.reason !== 'sos') {
          const decision = await checkRateLimit(
            deps.redis,
            `rl:loc:uid:${session.uid}`,
            LOC_PER_UID_RULE,
          );
          if (!decision.allowed) {
            throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
          }
        }
        await tx.query(
          `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, activity, mock_flags, at)
           SELECT $1, $2, $3, f.lat, f.lng, f.acc, f.activity, f.mock, f.at
           FROM jsonb_to_recordset($4::jsonb)
             AS f(lat double precision, lng double precision, acc real, activity text, mock smallint, at timestamptz)`,
          [session.uid, row.trip_id, body.share_id, JSON.stringify(fixes)],
        );
        return row;
      });

      const publish = deps.publish;
      if (publish !== undefined) {
        // The realtime envelope every hint carries (`{v, id, type, at, data}`), so the app's
        // channel layer dedupes and validates fixes like any other publication.
        const data = {
          v: 1,
          id: generateUuidV7(),
          type: 'fixes',
          at: new Date().toISOString(),
          data: {
            share_id: body.share_id,
            reason: share.reason,
            fixes: fixes.map((fix) => ({
              uid: session.uid,
              lat: fix.lat,
              lng: fix.lng,
              acc: fix.acc,
              at: fix.at,
              activity: fix.activity,
              mock: fix.mock,
            })),
          },
        };
        const channels = [`trip_locations:${share.trip_id}`];
        if (share.reason === 'sos') channels.push(`sos:${body.share_id}`);
        const results = await Promise.allSettled(channels.map((ch) => publish(ch, data)));
        for (const result of results) {
          if (result.status === 'rejected') deps.onPublishError?.(result.reason);
        }
      }
      return c.json({ accepted: fixes.length }, 202);
    },
    validationHook,
  );
}

/** Centrifugo server API `publish` (docs/api-contracts.md §5.7 "Server API (outbound)"). */
export function centrifugoPublisher(options: {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
}): LocationPublisher {
  const base = options.apiUrl.replace(/\/+$/, '');
  return async (channel, data) => {
    const response = await fetch(`${base}/api/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': options.apiKey },
      body: JSON.stringify({ channel, data }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 2000),
    });
    if (!response.ok) throw new Error(`centrifugo publish failed: HTTP ${response.status}`);
    const reply = (await response.json()) as { error?: { code: number; message: string } };
    if (reply.error !== undefined) {
      throw new Error(`centrifugo publish failed: ${reply.error.code} ${reply.error.message}`);
    }
  };
}

/** Mounts `POST /v1/loc`, broadcasting through Centrifugo when its server API is configured. */
export function registerLocationRouteFromEnv(
  app: OpenAPIHono<AppEnv>,
  doors: CommandDoorDeps,
  env: {
    readonly CENTRIFUGO_API_URL?: string | undefined;
    readonly CENTRIFUGO_HTTP_API_KEY?: string | undefined;
  },
): void {
  const apiUrl = env.CENTRIFUGO_API_URL;
  const apiKey = env.CENTRIFUGO_HTTP_API_KEY;
  registerLocationRoute(app, {
    pool: doors.pool,
    sessions: doors.sessions,
    redis: doors.redis,
    ...(apiUrl !== undefined && apiKey !== undefined
      ? { publish: centrifugoPublisher({ apiUrl, apiKey }) }
      : {}),
    onPublishError: (error) => doors.logger.error({ err: error }, 'location fix publish failed'),
  });
}
