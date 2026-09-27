/**
 * `GET /v1/cmd-results?since=&cursor=&limit=` (docs/api-contracts.md §5.2): the caller's own
 * command outcomes, for when sync is down and the client still needs to reconcile its queue.
 * Reads run as `app_user`, so the `cmd_results` owner-read policy is what scopes the rows.
 */
import { withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const CmdResultSchema = z
  .object({
    op_id: z.string(),
    cmd: z.string(),
    status: z.enum(['applied', 'rejected', 'duplicate']),
    code: z.string().nullable(),
    detail: z.unknown(),
    result_ref: z.unknown(),
    server_ts: z.string(),
  })
  .openapi('CmdResult');

const CmdResultsPageSchema = z
  .object({ items: z.array(CmdResultSchema), next_cursor: z.string().nullable() })
  .openapi('CmdResultsPage');

const cmdResultsRoute = createRoute({
  method: 'get',
  path: '/v1/cmd-results',
  tags: ['commands'],
  summary: "The caller's own command outcomes, oldest first",
  request: {
    query: z.object({
      since: z.iso.datetime({ offset: true }).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
    }),
  },
  responses: {
    200: {
      description: 'One page of outcomes',
      content: { 'application/json': { schema: CmdResultsPageSchema } },
    },
    401: {
      description: 'AUTH_REQUIRED',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    422: {
      description: 'VALIDATION',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

interface Cursor {
  readonly serverTs: string;
  readonly opId: string;
}

const cursorSchema = z.object({ t: z.iso.datetime({ offset: true }), o: z.uuid() });

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.serverTs, o: cursor.opId })).toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return { serverTs: parsed.t, opId: parsed.o };
  } catch {
    throw new DomainError('VALIDATION', { reason: 'invalid_cursor' });
  }
}

interface CmdResultRow {
  op_id: string;
  cmd: string;
  status: 'applied' | 'rejected' | 'duplicate';
  code: string | null;
  detail: unknown;
  result_ref: unknown;
  server_ts: string;
}

export function registerCmdResultsRoute(app: OpenAPIHono<AppEnv>, deps: CommandDoorDeps): void {
  app.openapi(
    cmdResultsRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      await enforceUidRateLimit(deps.redis, 'cmd-results', session.uid, CMD_RESULTS_PER_UID_RULE);

      const query = c.req.valid('query');
      const limit = query.limit ?? DEFAULT_LIMIT;
      const cursor = query.cursor !== undefined ? decodeCursor(query.cursor) : undefined;

      // Keyset pagination on (server_ts, op_id); `since` is an exclusive lower bound on server_ts.
      const rows = await withUser(deps.pool, session.uid, '', async (tx) => {
        const result = await tx.query<CmdResultRow>(
          // server_ts as ISO text at full microsecond precision: a JS Date would round it to ms
          // and the cursor would then re-serve the row it stopped at.
          `SELECT op_id, cmd, status, code, detail, result_ref, to_json(server_ts) #>> '{}' AS server_ts
             FROM cmd_results
            WHERE uid = $1
              AND ($2::timestamptz IS NULL OR server_ts > $2::timestamptz)
              AND ($3::timestamptz IS NULL OR (server_ts, op_id) > ($3::timestamptz, $4::uuid))
            ORDER BY server_ts, op_id
            LIMIT $5`,
          [
            session.uid,
            query.since ?? null,
            cursor?.serverTs ?? null,
            cursor?.opId ?? null,
            limit + 1,
          ],
        );
        return result.rows;
      });

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last !== undefined
          ? encodeCursor({ serverTs: last.server_ts, opId: last.op_id })
          : null;

      return c.json({ items: page, next_cursor: nextCursor }, 200);
    },
    validationHook,
  );
}
