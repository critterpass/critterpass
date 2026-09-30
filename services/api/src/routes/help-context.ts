/**
 * Help hub reads (docs/api-contracts.md §5.5), free on every trip:
 * - `GET /v1/help/context?trip_id&lat&lng`: numbers, facilities by drive time, phrases, a place
 *   label and the caller's open Help share (./../commands/safety/help-reads.ts);
 * - `GET /v1/help/checklist?trip_id&problem&lat&lng`: one problem's curated steps, worded by the
 *   guide in the caller's language within 3 s, or with `text: null` for the app's own template;
 * - `GET /v1/help/shares/{id}/fixes`: the latest fixes of a Help or SOS share the caller may see
 *   (`app.shared_location_fixes`), so the session map works on trips without the crew map.
 * - `GET /v1/sos/{id}/private`: the SOS sender's health notes, unsealed for the sender and the
 *   crewmates coming to help only (RLS on `help_session_private`); anyone else reads `null`.
 * The Help reads answer a participant of the trip only.
 */
import { personaIdSchema, writeHelpChecklist, type Gateway } from '@cp/ai';
import { crypto as dbCrypto, withUser } from '@cp/db';
import { checklistStepSchema, helpContextSchema, helpProblemSchema } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import {
  loadHelpTrip,
  readChecklistSteps,
  readHelpContext,
  type Position,
} from '../commands/safety/help-reads';
import { requireTripParticipant } from '../commands/safety/shared';
import type { FieldKeyring } from '../commands/bookings/deps';
import type { RoutingProvider } from '../routing/provider';

export interface HelpRouteDeps extends CommandDoorDeps {
  readonly routing: RoutingProvider;
  /** Undefined (no model key) = checklist steps in the app's own wording. */
  readonly gateway: Pick<Gateway, 'callModel'> | undefined;
  /** Without it no health notes were stored, so none are read. */
  readonly keyring?: FieldKeyring | undefined;
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const where = {
  trip_id: z.uuid(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
};

const contextRoute = createRoute({
  method: 'get',
  path: '/v1/help/context',
  tags: ['safety'],
  summary: 'Emergency numbers, nearest facilities and phrases for where the traveller is',
  request: { query: z.object(where) },
  responses: {
    200: {
      description: 'Help context',
      content: { 'application/json': { schema: helpContextSchema } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    403: errorResponse('NOT_ELIGIBLE: not on the trip'),
  },
});

const checklistSchema = z.object({
  problem: helpProblemSchema,
  worded: z.boolean(),
  steps: z.array(checklistStepSchema),
});

const checklistRoute = createRoute({
  method: 'get',
  path: '/v1/help/checklist',
  tags: ['safety'],
  summary: "One Help problem's curated steps, in the traveller's language when the guide answers",
  request: { query: z.object({ ...where, problem: helpProblemSchema }) },
  responses: {
    200: { description: 'Checklist', content: { 'application/json': { schema: checklistSchema } } },
    401: errorResponse('AUTH_REQUIRED'),
    403: errorResponse('NOT_ELIGIBLE: not on the trip'),
  },
});

const fixSchema = z.object({
  uid: z.uuid(),
  lat: z.number(),
  lng: z.number(),
  acc: z.number(),
  activity: z.string(),
  at: z.iso.datetime({ offset: true }),
});

const fixesRoute = createRoute({
  method: 'get',
  path: '/v1/help/shares/{id}/fixes',
  tags: ['safety'],
  summary: 'Latest fixes of a Help or SOS share the caller may see',
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'Newest first; empty when the share ended or is not visible',
      content: { 'application/json': { schema: z.object({ fixes: z.array(fixSchema) }) } },
    },
    401: errorResponse('AUTH_REQUIRED'),
  },
});

const privateRoute = createRoute({
  method: 'get',
  path: '/v1/sos/{id}/private',
  tags: ['safety'],
  summary: "The SOS sender's health notes, for the sender and responders only",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: '`null` when there are none or the caller may not read them',
      content: {
        'application/json': { schema: z.object({ health_notes: z.string().nullable() }) },
      },
    },
    401: errorResponse('AUTH_REQUIRED'),
  },
});

const positionOf = (q: { lat?: number | undefined; lng?: number | undefined }): Position | null =>
  q.lat === undefined || q.lng === undefined ? null : { lat: q.lat, lng: q.lng };

export function registerHelpContextRoutes(app: OpenAPIHono<AppEnv>, deps: HelpRouteDeps): void {
  app.openapi(
    contextRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const query = c.req.valid('query');
      const help = await withUser(deps.pool, session.uid, '', async (tx) => {
        await requireTripParticipant(tx, query.trip_id, session.uid);
        const trip = await loadHelpTrip(tx, query.trip_id);
        return readHelpContext(tx, { trip, uid: session.uid, at: positionOf(query) }, deps.routing);
      });
      c.header('Cache-Control', 'private, no-store');
      return c.json(help, 200);
    },
    validationHook,
  );

  app.openapi(
    checklistRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const query = c.req.valid('query');
      const { steps, trip, locale } = await withUser(deps.pool, session.uid, '', async (tx) => {
        await requireTripParticipant(tx, query.trip_id, session.uid);
        const helpTrip = await loadHelpTrip(tx, query.trip_id);
        const help = await readHelpContext(
          tx,
          { trip: helpTrip, uid: session.uid, at: positionOf(query) },
          deps.routing,
        );
        const user = await tx.query<{ locale: string | null }>(
          `SELECT coalesce(s.app_locale, u.locale) AS locale
             FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = $1`,
          [session.uid],
        );
        return {
          steps: await readChecklistSteps(tx, query.problem, help),
          trip: helpTrip,
          locale: user.rows[0]?.locale ?? 'en',
        };
      });
      const guide = personaIdSchema.safeParse(trip.guide);
      const result =
        deps.gateway === undefined
          ? { steps, worded: false }
          : await writeHelpChecklist(
              deps.gateway,
              { guide: guide.success ? guide.data : null, locale, problem: query.problem, steps },
              { context: { userId: session.uid, tripId: trip.id } },
            );
      c.header('Cache-Control', 'private, no-store');
      return c.json(
        { problem: query.problem, worded: result.worded, steps: [...result.steps] },
        200,
      );
    },
    validationHook,
  );

  app.openapi(
    fixesRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const shareId = c.req.valid('param').id;
      const fixes = await withUser(deps.pool, session.uid, '', async (tx) => {
        const { rows } = await tx.query<{
          user_id: string;
          lat: number;
          lng: number;
          accuracy_m: number;
          activity: string;
          at: Date;
        }>('SELECT * FROM app.shared_location_fixes($1, 20)', [shareId]);
        return rows.map((row) => ({
          uid: row.user_id,
          lat: row.lat,
          lng: row.lng,
          acc: row.accuracy_m,
          activity: row.activity,
          at: row.at.toISOString(),
        }));
      });
      c.header('Cache-Control', 'private, no-store');
      return c.json({ fixes }, 200);
    },
    validationHook,
  );

  app.openapi(
    privateRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const sosId = c.req.valid('param').id;
      const sealed = await withUser(deps.pool, session.uid, '', async (tx) => {
        const { rows } = await tx.query<{ health_notes_enc: string }>(
          'SELECT health_notes_enc FROM help_session_private WHERE help_session_id = $1',
          [sosId],
        );
        return rows[0]?.health_notes_enc ?? null;
      });
      const keyring = deps.keyring;
      const notes =
        sealed === null || keyring === undefined ? null : dbCrypto.decryptField(sealed, keyring);
      c.header('Cache-Control', 'private, no-store');
      return c.json({ health_notes: notes }, 200);
    },
    validationHook,
  );
}
