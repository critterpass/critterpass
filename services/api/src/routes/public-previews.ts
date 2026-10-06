/**
 * Public previews (docs/api-contracts.md §5.6): `GET /v1/public/{kind}/{token}`, public and
 * 60/min/IP. The web Worker calls it server-side for a link's page and share card. Every read runs
 * as `public_reader`, which sees only the public views for the one link named in the transaction,
 * so a preview can never carry more than those views allow.
 *
 * - `proposal`: the draft behind a trip invite; `{token}` is the trip's join code, `?seat=` a
 *   personal invite's seat token. A code or seat that is not live answers 404.
 * - `plan`: a published crew plan; `{token}` is an unlisted plan link's token. A revoked link, or
 *   one whose plan is not published (waiting on consent, declined, taken down), answers 404.
 */
import { createHash } from 'node:crypto';

import {
  DomainError,
  isSeatTokenShape,
  normalizeJoinCode,
  parseLinkPath,
  PUBLIC_PREVIEW_KINDS,
  PUBLIC_PROPOSAL_DAYS,
  publicPlanSchema,
  publicProposalSchema,
  type PublicPlan,
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
  readonly code?: string | null;
  readonly seatHash?: string | null;
  /** sha-256 hex of a plan link's token. */
  readonly planHash?: string | null;
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
        `SELECT set_config('app.public_code', $1, true), set_config('app.public_seat', $2, true),
                set_config('app.public_plan', $3, true)`,
        [scope.code ?? '', scope.seatHash ?? '', scope.planHash ?? ''],
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
  if ((scope.code ?? null) === null && (scope.seatHash ?? null) === null) return null;
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

/** The published plan behind a live plan link, or null when the link shows none. */
export async function readPublicPlan(pool: pg.Pool, token: string): Promise<PublicPlan | null> {
  if (parseLinkPath(`/p/${token}`)?.kind !== 'plan_share') return null;
  const planHash = createHash('sha256').update(token).digest('hex');
  const rows = await asPublicReader(pool, { planHash }, async (tx) => {
    const { rows: plans } = await tx.query<Record<string, unknown>>(
      `SELECT shared_plan_id, title, destination_name, days_count, travel_month, travel_year,
              crew_size, crew_names, travelled, tags, days, rating_avg, rating_count, copies_count
         FROM public.shared_plan_public LIMIT 1`,
    );
    return plans;
  });
  const row = rows[0];
  return row === undefined ? null : publicPlanSchema.parse({ kind: 'plan', ...row });
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
      content: {
        'application/json': { schema: z.union([publicProposalSchema, publicPlanSchema]) },
      },
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
      const { kind, token } = c.req.valid('param');
      c.header('cache-control', 'private, no-store');
      if (kind === 'plan') {
        const plan = await readPublicPlan(deps.pool, token);
        if (plan === null) throw new DomainError('NOT_FOUND');
        return c.json(plan, 200);
      }
      const { seat } = c.req.valid('query');
      const seatHash = seat !== undefined && isSeatTokenShape(seat) ? seatTokenHash(seat) : null;
      const code = seatHash === null ? normalizeJoinCode(token) : null;
      const proposal = await readPublicProposal(deps.pool, { code, seatHash });
      if (proposal === null) throw new DomainError('NOT_FOUND');
      return c.json(proposal, 200);
    },
    validationHook,
  );
}
