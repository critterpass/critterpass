/**
 * Public previews (docs/api-contracts.md §5.6): `GET /v1/public/{kind}/{token}`, public and
 * 60/min/IP. The web Worker calls it server-side for a link's page and share card. Every read runs
 * as `public_reader`, which sees only the public views for the one link named in the transaction,
 * so a preview can never carry more than those views allow.
 *
 * - `proposal`: the draft behind a trip invite; `{token}` is the trip's join code, `?seat=` a
 *   personal invite's seat token. A code or seat that is not live answers 404.
 */
import {
  DomainError,
  isSeatTokenShape,
  normalizeJoinCode,
  PUBLIC_PREVIEW_KINDS,
  PUBLIC_PROPOSAL_DAYS,
  publicProposalSchema,
  type PublicProposal,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import { seatTokenHash } from '../commands/invites/deps';
import { enforce, PREVIEW_PER_IP_RULE, visitorOf } from './links';

export interface PublicPreviewRouteDeps extends CommandDoorDeps {
  /** Shared with the web Worker; absent means visitor headers are never trusted. */
  readonly webProxySecret?: string | undefined;
}

/** The link a public read is scoped to; every other setting stays unset. */
interface PublicScope {
  readonly code: string | null;
  readonly seatHash: string | null;
}

const STATEMENT_TIMEOUT_MS = 5_000;

/** Runs `fn` as `public_reader` with only this link's settings. */
async function asPublicReader<T>(
  pool: pg.Pool,
  scope: PublicScope,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let failure: unknown;
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query('SET LOCAL ROLE public_reader');
      await client.query(
        "SELECT set_config('app.public_code', $1, true), set_config('app.public_seat', $2, true)",
        [scope.code ?? '', scope.seatHash ?? ''],
      );
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      failure = error;
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    client.release(failure !== undefined);
  }
}

interface ProposalDayRow {
  readonly day_no: number;
  readonly date: string | null;
  readonly theme: string | null;
  readonly days_total: number;
  readonly stops: string[];
}

/** The proposal behind a live trip link, or null when the link shows none. */
export async function readPublicProposal(
  pool: pg.Pool,
  scope: PublicScope,
): Promise<PublicProposal | null> {
  if (scope.code === null && scope.seatHash === null) return null;
  const rows = await asPublicReader(pool, scope, async (tx) => {
    const { rows: days } = await tx.query<ProposalDayRow>(
      `SELECT day_no, date, theme, days_total, stops
         FROM public.proposal_public ORDER BY day_no LIMIT $1`,
      [PUBLIC_PROPOSAL_DAYS],
    );
    return days;
  });
  const first = rows[0];
  if (first === undefined) return null;
  return publicProposalSchema.parse({
    kind: 'proposal',
    days_total: first.days_total,
    days: rows.map((row) => ({
      day_no: row.day_no,
      date: row.date,
      theme: row.theme,
      stops: row.stops,
    })),
  });
}

const route = createRoute({
  method: 'get',
  path: '/v1/public/{kind}/{token}',
  tags: ['links'],
  summary: 'Public-safe preview of what a shared link points at',
  request: {
    params: z.object({
      kind: z.enum(PUBLIC_PREVIEW_KINDS),
      token: z.string().min(1).max(64),
    }),
    query: z.object({ seat: z.string().max(64).optional() }),
  },
  responses: {
    200: {
      description: 'Preview',
      content: { 'application/json': { schema: publicProposalSchema } },
    },
    404: {
      description: 'NOT_FOUND: unknown, switched-off or expired link, or nothing to show',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    429: {
      description: 'RATE_LIMITED',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
  },
});

export function registerPublicPreviewRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: PublicPreviewRouteDeps,
): void {
  app.openapi(
    route,
    async (c) => {
      const visitor = visitorOf(c, deps);
      await enforce(deps.redis, `rl:public:preview:ip:${visitor.ip}`, PREVIEW_PER_IP_RULE);
      const { token } = c.req.valid('param');
      const { seat } = c.req.valid('query');
      const seatHash = seat !== undefined && isSeatTokenShape(seat) ? seatTokenHash(seat) : null;
      const code = seatHash === null ? normalizeJoinCode(token) : null;
      const proposal = await readPublicProposal(deps.pool, { code, seatHash });
      if (proposal === null) throw new DomainError('NOT_FOUND');
      c.header('cache-control', 'private, no-store');
      return c.json(proposal, 200);
    },
    validationHook,
  );
}
