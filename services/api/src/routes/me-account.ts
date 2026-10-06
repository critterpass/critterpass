/**
 * The caller's account routes (docs/api-contracts.md §5.5, docs/api-contracts-you.md): username
 * availability for 3n-3, the delete-account preflight for 3n-9, the account state the restore interstitial needs (answered while the
 * account is closed), and the immediate purge test devices use. Every route acts on the session's
 * own uid only.
 */
import { withSystem } from '@cp/db';
import {
  accountStateSchema,
  deletionPreflightSchema,
  DomainError,
  normalizeUsername,
  purgeNowResultSchema,
  usernameAvailabilitySchema,
  usernameProblem,
  type AccountState,
  type UsernameAvailability,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AccountAuthControl } from '../account/auth-control';
import { deletionPreflight } from '../account/preflight';
import { purgeNow, type AppEnvTier } from '../account/purge-now';
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

export interface MeAccountDeps extends CommandDoorDeps {
  readonly control: AccountAuthControl;
  readonly appEnv: AppEnvTier;
}

const errors = {
  401: {
    description: 'AUTH_REQUIRED',
    content: { 'application/json': { schema: ErrorBodySchema } },
  },
  403: { description: 'FORBIDDEN', content: { 'application/json': { schema: ErrorBodySchema } } },
  404: { description: 'NOT_FOUND', content: { 'application/json': { schema: ErrorBodySchema } } },
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

const accountRoute = createRoute({
  method: 'get',
  path: '/v1/me/account',
  tags: ['me'],
  summary: "The caller's account status and any open deletion (answered while closed)",
  responses: json(accountStateSchema, 'The account state'),
});

const preflightRoute = createRoute({
  method: 'get',
  path: '/v1/me/deletion/preflight',
  tags: ['me'],
  summary: 'What deleting the account takes, and what the crew keeps (3n-9)',
  responses: json(deletionPreflightSchema, 'Counts, crew balances, organiser hand-overs, billing'),
});

const purgeNowRoute = createRoute({
  method: 'post',
  path: '/v1/me/deletion/purge-now',
  tags: ['me'],
  summary: "Erases the caller's account at once; refused in production",
  responses: json(purgeNowResultSchema, 'The account is erased and every session ended'),
});

/** Erasing an account is rare: a handful of tries an hour is plenty for a test device. */
const PURGE_NOW_PER_UID_RULE = { windowSeconds: 3600, max: 6 } as const;

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

  app.openapi(
    accountRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers, 'me_account');
      const state = await withSystem(deps.pool, async (tx) => {
        const { rows } = await tx.query<{
          status: AccountState['status'];
          requested_at: Date | null;
          purge_at: Date | null;
        }>(
          `SELECT u.status, d.requested_at, d.purge_at FROM users u
             LEFT JOIN account_deletions d
               ON d.user_id = u.id AND d.restored_at IS NULL AND d.purged_at IS NULL
            WHERE u.id = $1`,
          [uid],
        );
        return rows[0];
      });
      if (state === undefined) throw new DomainError('NOT_FOUND');
      const body: AccountState = {
        status: state.status,
        deletion:
          state.requested_at === null || state.purge_at === null
            ? null
            : {
                requested_at: state.requested_at.toISOString(),
                purge_at: state.purge_at.toISOString(),
              },
      };
      return c.json(body, 200);
    },
    validationHook,
  );

  app.openapi(
    preflightRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers, 'me_deletion_preflight');
      const body = await withSystem(deps.pool, (tx) => deletionPreflight(tx, uid));
      return c.json(body, 200);
    },
    validationHook,
  );

  app.openapi(
    purgeNowRoute,
    async (c) => {
      // Refused before anything else, so production never even reads the session for this.
      if (deps.appEnv === 'production') {
        throw new DomainError('FORBIDDEN', { reason: 'production' });
      }
      const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
      await enforceUidRateLimit(deps.redis, 'me_purge_now', uid, PURGE_NOW_PER_UID_RULE);
      const result = await purgeNow(
        { pool: deps.pool, control: deps.control, appEnv: deps.appEnv },
        uid,
      );
      return c.json(result, 200);
    },
    validationHook,
  );
}
