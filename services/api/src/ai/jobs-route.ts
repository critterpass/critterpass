/**
 * `GET /v1/jobs/{id}` (docs/api-contracts.md §5.3): poll fallback for any AI job when realtime
 * `job.progress` is not reaching the client. Reads run as `app_user`, so `agent_jobs` RLS (the
 * job's own user, or the trip organiser) decides visibility; anything else is `NOT_FOUND`.
 */
import { withUser } from '@cp/db';
import { AGENT_JOB_KINDS, AGENT_JOB_STATUSES, DomainError } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { ErrorBodySchema, validationHook } from '../commands/_framework/doors';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export interface JobsRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
}

const AgentJobSchema = z
  .object({
    job_id: z.string(),
    kind: z.enum(AGENT_JOB_KINDS),
    status: z.enum(AGENT_JOB_STATUSES),
    trip_id: z.string().nullable(),
    steps: z.array(z.unknown()),
    partial: z.unknown(),
    result_ref: z.unknown(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('AgentJob');

const jobRoute = createRoute({
  method: 'get',
  path: '/v1/jobs/{id}',
  tags: ['ai'],
  summary: "An AI job's status and step progress",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: 'The job', content: { 'application/json': { schema: AgentJobSchema } } },
    401: {
      description: 'AUTH_REQUIRED',
      content: { 'application/json': { schema: ErrorBodySchema } },
    },
    404: { description: 'NOT_FOUND', content: { 'application/json': { schema: ErrorBodySchema } } },
  },
});

interface JobRow {
  readonly id: string;
  readonly kind: (typeof AGENT_JOB_KINDS)[number];
  readonly status: (typeof AGENT_JOB_STATUSES)[number];
  readonly trip_id: string | null;
  readonly steps: unknown[];
  readonly partial: unknown;
  readonly result_ref: unknown;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export function registerJobsRoute(app: OpenAPIHono<AppEnv>, deps: JobsRouteDeps): void {
  app.openapi(
    jobRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const { id } = c.req.valid('param');
      const row = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
        const { rows } = await tx.query<JobRow>(
          `SELECT id, kind, status, trip_id, steps, partial, result_ref, created_at, updated_at
         FROM agent_jobs WHERE id = $1`,
          [id],
        );
        return rows[0];
      });
      if (row === undefined) throw new DomainError('NOT_FOUND');
      return c.json(
        {
          job_id: row.id,
          kind: row.kind,
          status: row.status,
          trip_id: row.trip_id,
          steps: row.steps,
          partial: row.partial,
          result_ref: row.result_ref,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        },
        200,
      );
    },
    validationHook,
  );
}
