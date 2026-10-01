/**
 * The guide's two lines around an invite (docs/api-contracts.md §5.3), for crew members only:
 *
 * - `POST /v1/invites/tags`: taste tags (at most three, from the taxonomy) and one line the trip's
 *   guide suggests from the inviter's note about a friend; the inviter confirms them in the
 *   composer. The note is screened by the input compliance check beside the model call, and a
 *   flagged note gets the keyword template instead of the model's answer.
 * - `POST /v1/crews/{crew_id}/welcome`: the welcome line the crew manifest types out for the caller,
 *   who has just joined.
 *
 * Both run on the `micro.line` route through the gateway, so its kill switch, the cost guard's
 * pause and usage metering apply. Every failure (switched off, no model configured, a decline, an
 * answer out of bounds) answers the template line with `source: 'template'`, never an error: the
 * app shows its own scripted line only when it cannot reach this route at all.
 */
import {
  createGateway,
  inferInviteTags,
  personaIdSchema,
  recordUsage,
  templateCrewWelcome,
  templateInviteTags,
  writeCrewWelcome,
  type Gateway,
  type PersonaId,
  type UsageContext,
} from '@cp/ai';
import { withSystem, withUser } from '@cp/db';
import {
  DomainError,
  inviteTagsRequestSchema,
  type CrewWelcomeResponse,
  type InviteTagsResponse,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { validationHook } from '../commands/_framework/doors';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import type { ApiEnv } from '../env';
import { createKillSwitches } from '../ops/kill-switches';
import { createApiCompliance, type ApiCompliance } from './compliance';

export interface InviteLineDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  /** The api's gateway; undefined (no model key configured) = template lines only. */
  readonly gateway: Pick<Gateway, 'callModel'> | undefined;
  readonly compliance: Pick<ApiCompliance, 'check'>;
}

/** A composer suggests as the inviter types and a manifest asks once; this stops a runaway client. */
const LINES_PER_UID_RULE = { windowSeconds: 60, max: 20 };

const DEFAULT_GUIDE: PersonaId = 'tokek';

const welcomeBodySchema = z.object({ trip_id: z.uuid().optional() }).strict();

interface CrewFacts {
  readonly crewName: string;
  readonly members: number;
  readonly me: string;
  /** The language the caller's app is in (`app.user_locale`). */
  readonly locale: string;
  readonly guide: PersonaId;
  readonly place: string | undefined;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainError('VALIDATION', {
      issues: [{ path: [], code: 'invalid_json', message: 'The body is not JSON' }],
    });
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  validationHook(parsed);
  return parsed.data as T;
}

/** The caller's crew as they see it (RLS decides membership), or NOT_FOUND. */
async function crewFacts(
  pool: pg.Pool,
  uid: string,
  crewId: string,
  tripId: string | undefined,
): Promise<CrewFacts> {
  return withUser(pool, uid, 'unknown', async (tx) => {
    const { rows } = await tx.query<{
      name: string;
      members: number;
      me: string | null;
      locale: string;
    }>(
      `SELECT c.name,
              (SELECT count(*)::int FROM crew_members m
                WHERE m.crew_id = c.id AND m.status = 'active') AS members,
              (SELECT display_name FROM users WHERE id = $2) AS me,
              app.user_locale($2) AS locale
         FROM crews c
        WHERE c.id = $1
          AND EXISTS (SELECT 1 FROM crew_members m
                       WHERE m.crew_id = c.id AND m.user_id = $2 AND m.status = 'active')`,
      [crewId, uid],
    );
    const crew = rows[0];
    if (crew === undefined) throw new DomainError('NOT_FOUND', { reason: 'crew' });
    if (tripId === undefined) {
      return {
        crewName: crew.name,
        members: crew.members,
        me: crew.me ?? '',
        locale: crew.locale,
        guide: DEFAULT_GUIDE,
        place: undefined,
      };
    }
    const { rows: trips } = await tx.query<{ guide: string | null; place: string | null }>(
      `SELECT g.slug AS guide, d.name AS place
         FROM trips t
         LEFT JOIN guides g ON g.id = t.guide_id
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1 AND t.crew_id = $2`,
      [tripId, crewId],
    );
    const trip = trips[0];
    if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    const guide = personaIdSchema.safeParse(trip.guide);
    return {
      crewName: crew.name,
      members: crew.members,
      me: crew.me ?? '',
      locale: crew.locale,
      guide: guide.success ? guide.data : DEFAULT_GUIDE,
      place: trip.place ?? undefined,
    };
  });
}

export function registerInviteLineRoutes(app: OpenAPIHono<AppEnv>, deps: InviteLineDeps): void {
  app.post('/v1/invites/tags', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'ai_lines', uid, LINES_PER_UID_RULE);
    const body = parse(inviteTagsRequestSchema, await readJson(c.req.raw));
    const facts = await crewFacts(deps.pool, uid, body.crew_id, body.trip_id);
    const input = { note: body.note, inviteeName: body.invitee_name, guide: facts.guide };
    const context: UsageContext = {
      userId: uid,
      crewId: body.crew_id,
      tripId: body.trip_id ?? null,
    };
    const [screen, suggested] = await Promise.all([
      deps.compliance.check('guide_input', body.note, context),
      deps.gateway === undefined
        ? Promise.resolve(templateInviteTags(input))
        : inferInviteTags(deps.gateway, input, context),
    ]);
    const result = screen.outcome === 'pass' ? suggested : templateInviteTags(input);
    const response: InviteTagsResponse = {
      tags: [...result.tags],
      line: result.line,
      guide: facts.guide,
      source: result.source,
    };
    c.header('Cache-Control', 'private, no-store');
    return c.json(response);
  });

  app.post('/v1/crews/:crew_id/welcome', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'ai_lines', uid, LINES_PER_UID_RULE);
    const crewId = parse(z.uuid(), c.req.param('crew_id'));
    const body = parse(welcomeBodySchema, await readJson(c.req.raw));
    const facts = await crewFacts(deps.pool, uid, crewId, body.trip_id);
    const input = {
      newcomer: facts.me,
      crewName: facts.crewName,
      members: facts.members,
      guide: facts.guide,
      // The line is shown to the caller on their manifest: in the language their app is in.
      locale: facts.locale,
      ...(facts.place === undefined ? {} : { place: facts.place }),
    };
    const context: UsageContext = { userId: uid, crewId, tripId: body.trip_id ?? null };
    const result =
      deps.gateway === undefined
        ? templateCrewWelcome(input)
        : await writeCrewWelcome(deps.gateway, input, context);
    const response: CrewWelcomeResponse = { line: result.line, source: result.source };
    c.header('Cache-Control', 'private, no-store');
    return c.json(response);
  });
}

/**
 * Boot wiring: the gateway runs only with a model key (`ANTHROPIC_API_KEY`, the DeepSeek key), and
 * both the gateway and the compliance check honour the ops kill switches and record their usage.
 */
export function registerInviteLineRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<InviteLineDeps, 'gateway' | 'compliance'>,
  env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL' | 'TYPESAFE_API_KEY'>,
  logger: { warn(details: object, message: string): void },
): void {
  const switches = createKillSwitches(deps.pool);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          assertRouteOn: switches.assertAiRoute,
          onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
        });
  if (gateway === undefined) {
    logger.warn({}, 'guide lines answer from templates: ANTHROPIC_API_KEY is unset');
  }
  const compliance = createApiCompliance({
    pool: deps.pool,
    typesafeApiKey: env.TYPESAFE_API_KEY,
    gateway,
    switches,
    logger,
  });
  registerInviteLineRoutes(app, { ...deps, gateway, compliance });
}
