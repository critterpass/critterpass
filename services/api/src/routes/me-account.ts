/**
 * The caller's account reads (docs/api-contracts.md §5.5, doc delta in docs/api-contracts-you.md):
 * username availability for 3n-3, the deletion preflight for 3n-9, a signed link to a finished
 * data export, and the account state the restore interstitial needs. Every route answers for the
 * session's own uid only; the account state is readable while the account is closed.
 */
import { withSystem } from '@cp/db';
import {
  accountStateSchema,
  dataExportLinkSchema,
  deletionPreflightSchema,
  DomainError,
  normalizeUsername,
  usernameAvailabilitySchema,
  usernameProblem,
  type AccountState,
  type DataExportLink,
  type UsernameAvailability,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import { loadDeletionPreflight } from '../account/preflight';
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
import { mintReadUrl, READ_URL_TTL_SECONDS, type MediaSigningConfig } from '../media/sign';

export interface MeAccountDeps extends CommandDoorDeps {
  /** Absent when media signing is not configured: a ready export then has no link yet. */
  readonly signing: MediaSigningConfig | undefined;
}

const errors = {
  401: {
    description: 'AUTH_REQUIRED',
    content: { 'application/json': { schema: ErrorBodySchema } },
  },
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

const preflightRoute = createRoute({
  method: 'get',
  path: '/v1/me/deletion/preflight',
  tags: ['me'],
  summary: 'What deleting the account takes and what the crew keeps',
  responses: json(deletionPreflightSchema, 'The preflight'),
});

const exportRoute = createRoute({
  method: 'get',
  path: '/v1/me/export/{id}',
  tags: ['me'],
  summary: "One of the caller's data exports, with a short-lived download link when ready",
  request: { params: z.object({ id: z.uuid() }) },
  responses: json(dataExportLinkSchema, 'The export'),
});

const accountRoute = createRoute({
  method: 'get',
  path: '/v1/me/account',
  tags: ['me'],
  summary: "The caller's account status and any open deletion (answered while closed)",
  responses: json(accountStateSchema, 'The account state'),
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

  app.openapi(
    preflightRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers, 'me_preflight');
      const preflight = await withSystem(deps.pool, (tx) => loadDeletionPreflight(tx, uid));
      return c.json(preflight, 200);
    },
    validationHook,
  );

  app.openapi(
    exportRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers, 'me_export');
      const { id } = c.req.valid('param');
      const { rows } = await withSystem(deps.pool, (tx) =>
        tx.query<{
          status: DataExportLink['status'];
          r2_key: string | null;
          expires_at: Date | null;
          bytes: string | null;
        }>(
          'SELECT status, r2_key, expires_at, bytes::text FROM data_exports WHERE id = $1 AND user_id = $2',
          [id, uid],
        ),
      );
      const row = rows[0];
      if (row === undefined) throw new DomainError('NOT_FOUND');
      const live =
        row.status === 'ready' &&
        row.r2_key !== null &&
        row.expires_at !== null &&
        row.expires_at.getTime() > Date.now();
      let url: string | null = null;
      if (live && row.r2_key !== null && deps.signing !== undefined) {
        const exp = Math.floor(Date.now() / 1000) + READ_URL_TTL_SECONDS;
        url = await mintReadUrl(deps.signing, row.r2_key, exp);
      }
      const body: DataExportLink = {
        export_id: id,
        status: row.status === 'ready' && !live ? 'expired' : row.status,
        url,
        expires_at: row.expires_at?.toISOString() ?? null,
        bytes: row.bytes === null ? null : Number(row.bytes),
      };
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
}
