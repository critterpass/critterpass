/**
 * Crew plans over HTTP (docs/api-contracts.md §5.5), shared content read with the five-minute
 * private cache and ETag every shared-content read uses; never synced.
 *
 * - `GET /v1/shared-plans?destination_id&trip_id&…` ranked published plans and the guide's pick;
 * - `GET /v1/shared-plans/{id}` one plan (a tombstone once unpublished) and whether it is saved;
 * - `GET /v1/shared-plans/{id}/guide-note?trip_id` how the plan overlaps the crew's trip (numbers
 *   from code; the app words the note);
 * - `GET /v1/trips/{tripId}/shared-plan` the trip's own publishing state, for its members;
 * - `GET /v1/trips/{tripId}/rating-cards` the places a participant can rate.
 *
 * Every read checks the caller as app_user first; the projection reads run as the system because
 * app_user is never granted the columns that tie a plan to its crew.
 */
import { withSystem, withUser } from '@cp/db';
import {
  DomainError,
  type LinkEnvironment,
  sharedPlanProjectionSchema,
  sharedPlansQuerySchema,
  type SharedPlanDetail,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import {
  browseSharedPlans,
  crewTaste,
  guideNote,
  sharedPlanCard,
  sharedPlanRow,
  soloTaste,
} from '../commands/community/reads';
import { tripRatingCards, tripSharedPlan } from '../commands/community/trip-reads';
import { registerCommunityCommands } from '../commands/community';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import type { ApiEnv } from '../env';
import {
  mediaSigningConfigFromEnv,
  mintReadUrl,
  READ_URL_TTL_SECONDS,
  type MediaSigningConfig,
} from '../media/sign';
import { resolveDestination } from '../travel-data/destination-ref';
import { sendSharedContent } from './shared-content-cache';

export interface SharedPlanRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  /** Unset (no media keys): plans show no photos. */
  readonly signing?: MediaSigningConfig | undefined;
}

async function requireMember(pool: pg.Pool, uid: string, tripId: string): Promise<void> {
  const member = await withUser(pool, uid, 'unknown', async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>('SELECT app.is_trip_member($1) AS ok', [
      tripId,
    ]);
    return rows[0]?.ok === true;
  });
  if (!member) throw new DomainError('NOT_FOUND', { reason: 'trip' });
}

/** Signed for the current 15-minute window, so a cached body keeps working URLs. */
async function photoUrls(signing: MediaSigningConfig | undefined, keys: readonly string[]) {
  if (signing === undefined) return [];
  const window = READ_URL_TTL_SECONDS;
  const expiresAt = (Math.floor(Date.now() / 1000 / window) + 2) * window;
  return Promise.all(keys.map((key) => mintReadUrl(signing, key, expiresAt)));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string, reason: string): string {
  if (!UUID.test(value)) throw new DomainError('NOT_FOUND', { reason });
  return value;
}

export function registerSharedPlanRoutes(app: OpenAPIHono<AppEnv>, deps: SharedPlanRouteDeps) {
  app.get('/v1/shared-plans', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const parsed = sharedPlansQuerySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'query' });
    const query = parsed.data;
    if (query.trip_id !== undefined) await requireMember(deps.pool, uid, query.trip_id);
    const page = await withSystem(deps.pool, async (tx) => {
      const destination = await resolveDestination(tx, query.destination_id);
      const taste =
        query.trip_id === undefined
          ? await soloTaste(tx, uid)
          : await crewTaste(tx, query.trip_id, uid);
      return browseSharedPlans(tx, { ...query, destination_id: destination.id }, taste);
    });
    return sendSharedContent(c, page);
  });

  app.get('/v1/shared-plans/:id', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const id = uuidParam(c.req.param('id'), 'shared_plan');
    const detail = await withSystem(deps.pool, async (tx): Promise<SharedPlanDetail> => {
      const row = await sharedPlanRow(tx, id);
      if (row === null) throw new DomainError('NOT_FOUND', { reason: 'shared_plan' });
      const { rows: saved } = await tx.query(
        "SELECT 1 FROM saved_items WHERE user_id = $1 AND kind = 'plan' AND ref_id = $2",
        [uid, id],
      );
      const projection =
        row.status === 'published' ? sharedPlanProjectionSchema.parse(row.projection) : null;
      return {
        status: row.status === 'published' ? 'published' : 'unpublished',
        card: sharedPlanCard(row, null),
        projection,
        photo_urls: await photoUrls(deps.signing, projection?.photos ?? []),
        saved: saved.length > 0,
      };
    });
    return sendSharedContent(c, detail);
  });

  app.get('/v1/shared-plans/:id/guide-note', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const id = uuidParam(c.req.param('id'), 'shared_plan');
    const tripId = uuidParam(c.req.query('trip_id') ?? '', 'trip');
    await requireMember(deps.pool, uid, tripId);
    const note = await withSystem(deps.pool, async (tx) => {
      const row = await sharedPlanRow(tx, id);
      if (row?.status !== 'published')
        throw new DomainError('NOT_FOUND', { reason: 'shared_plan' });
      return guideNote(tx, sharedPlanProjectionSchema.parse(row.projection), tripId);
    });
    return sendSharedContent(c, note);
  });

  app.get('/v1/trips/:tripId/shared-plan', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const tripId = uuidParam(c.req.param('tripId'), 'trip');
    await requireMember(deps.pool, uid, tripId);
    const state = await withSystem(deps.pool, (tx) => tripSharedPlan(tx, tripId, uid));
    c.header('Cache-Control', 'private, no-store');
    return c.json(state);
  });

  app.get('/v1/trips/:tripId/rating-cards', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const tripId = uuidParam(c.req.param('tripId'), 'trip');
    await requireMember(deps.pool, uid, tripId);
    const cards = await withSystem(deps.pool, (tx) => tripRatingCards(tx, tripId, uid));
    c.header('Cache-Control', 'private, no-store');
    return c.json(cards);
  });
}

const LINK_ENVIRONMENT: Record<ApiEnv['APP_ENV'], LinkEnvironment> = {
  production: 'production',
  staging: 'staging',
  local: 'development',
};

/** Community on the api: its commands and the crew plan reads. */
export function registerCommunity(
  app: OpenAPIHono<AppEnv>,
  doors: CommandDoorDeps,
  env: ApiEnv,
): void {
  registerCommunityCommands(doors.registry, LINK_ENVIRONMENT[env.APP_ENV]);
  const signing =
    env.MEDIA_PUBLIC_BASE_URL && env.MEDIA_HMAC_KEYS && env.MEDIA_HMAC_ACTIVE_KID
      ? mediaSigningConfigFromEnv({
          baseUrl: env.MEDIA_PUBLIC_BASE_URL,
          keysJson: env.MEDIA_HMAC_KEYS,
          activeKeyId: env.MEDIA_HMAC_ACTIVE_KID,
        })
      : undefined;
  registerSharedPlanRoutes(app, { ...doors, signing });
}
