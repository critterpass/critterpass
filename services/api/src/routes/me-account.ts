/**
 * The caller's account reads (docs/api-contracts.md §5.5): username availability for 3n-3. The
 * route answers for the session's own uid only.
 */
import { withSystem } from '@cp/db';
import {
  normalizeUsername,
  usernameAvailabilitySchema,
  usernameProblem,
  type UsernameAvailability,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import {
  CMD_RESULTS_PER_UID_RULE,
  enforceUidRateLimit,
  requireCommandSession,
} from '../commands/_framework/session';

export type MeAccountDeps = CommandDoorDeps;

const errors = {
  401: {
    description: 'AUTH_REQUIRED',
    content: { 'application/json': { schema: ErrorBodySchema } },
  },
  422: { description: 'VALIDATION', content: { 'application/json': { schema: ErrorBodySchema } } },
  429: {
    description: 'RATE_LIMITED',
    content: { 'application/json': { schema: ErrorBodySchema } },
  },
} as const;

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  200: { description, content: { 'application/json': { schema } } },
  ...errors,
});

const usernameRoute = createRoute({
  method: 'get',
  path: '/v1/me/username-available',
  tags: ['me'],
  summary: 'Whether a username may be taken by the caller',
  request: { query: z.object({ u: z.string().min(1).max(40) }) },
  responses: json(usernameAvailabilitySchema, 'Availability and the rule it breaks, if any'),
});

export function registerMeAccountRoutes(app: OpenAPIHono<AppEnv>, deps: MeAccountDeps): void {
  const session = async (headers: Headers, door: string) => {
    const current = await requireCommandSession(deps.sessions, headers);
    await enforceUidRateLimit(deps.redis, door, current.uid, CMD_RESULTS_PER_UID_RULE);
    return current;
  };

  app.openapi(
    usernameRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers, 'me_username');
      const username = normalizeUsername(c.req.valid('query').u);
      const problem = usernameProblem(username);
      let body: UsernameAvailability = { username, available: problem === null, reason: problem };
      if (problem === null) {
        const taken = await withSystem(deps.pool, (tx) =>
          tx.query('SELECT 1 FROM users WHERE username = $1 AND id <> $2', [username, uid]),
        );
        if ((taken.rowCount ?? 0) > 0) body = { username, available: false, reason: 'taken' };
      }
      return c.json(body, 200);
    },
    validationHook,
  );
}
