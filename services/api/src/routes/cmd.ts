/**
 * `POST /v1/cmd/{cmd}` (docs/api-contracts.md §2.2, §5.2): one envelope, executed synchronously
 * through the command pipeline. Applied (or a replay of an applied op) → 200 `{status, result}`;
 * a reject → the error envelope with the code's own HTTP status, the same outcome that
 * `cmd_results` records.
 */
import { executeCommand } from '@cp/db';
import { DomainError } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import {
  CommandEnvelopeSchema,
  CommandOutcomeSchema,
  ErrorBodySchema,
  outcomeBody,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import {
  CMD_PER_UID_RULE,
  enforceUidRateLimit,
  requireCommandSession,
} from '../commands/_framework/session';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const commandRoute = createRoute({
  method: 'post',
  path: '/v1/cmd/{cmd}',
  tags: ['commands'],
  summary: 'Run one command synchronously',
  request: {
    params: z.object({ cmd: z.string().min(1) }),
    body: {
      required: true,
      content: { 'application/json': { schema: CommandEnvelopeSchema } },
    },
  },
  responses: {
    200: {
      description: 'Applied, or a replay of an already-applied op_id',
      content: { 'application/json': { schema: CommandOutcomeSchema } },
    },
    401: errorResponse(
      'AUTH_REQUIRED: no session, or an anonymous session on a registered-only command',
    ),
    402: errorResponse('Entitlement or quota reject'),
    403: errorResponse('FORBIDDEN / NOT_ELIGIBLE'),
    404: errorResponse('NOT_FOUND'),
    409: errorResponse('STATE_INVALID / VERSION_CONFLICT / IDEMPOTENCY_MISMATCH'),
    422: errorResponse('VALIDATION'),
    429: errorResponse('RATE_LIMITED'),
  },
});

/** `VALIDATION` detail's issue paths (`device.tz`), so a reject is diagnosable from the log. */
function issuePaths(detail: unknown): string[] | undefined {
  const issues = (detail as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return undefined;
  return issues.map((issue) => {
    const path = (issue as { path?: unknown }).path;
    return Array.isArray(path) ? path.map(String).join('.') : '';
  });
}

export function registerCommandRoute(app: OpenAPIHono<AppEnv>, deps: CommandDoorDeps): void {
  app.openapi(
    commandRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      await enforceUidRateLimit(deps.redis, 'cmd', session.uid, CMD_PER_UID_RULE);

      const { cmd } = c.req.valid('param');
      const envelope = c.req.valid('json');
      if (envelope.cmd !== cmd) {
        throw new DomainError('VALIDATION', { reason: 'cmd_path_mismatch' });
      }

      const outcome = await executeCommand(envelope, {
        pool: deps.pool,
        resolve: deps.registry.resolve,
        actor: { kind: 'user', uid: session.uid, isAnonymous: session.isAnonymous },
        door: 'cmd',
      });

      const rejection =
        outcome.status === 'rejected'
          ? { code: outcome.code, detail: outcome.detail }
          : outcome.status === 'duplicate' && outcome.original === 'rejected'
            ? { code: outcome.code ?? 'INTERNAL', detail: outcome.detail }
            : undefined;
      if (rejection !== undefined) {
        // The code and the failing field paths only: never payload values.
        deps.logger.info(
          {
            req_id: c.var.requestId,
            cmd,
            code: rejection.code,
            fields: issuePaths(rejection.detail),
          },
          'command rejected',
        );
        throw new DomainError(rejection.code, rejection.detail);
      }
      return c.json(outcomeBody(outcome), 200);
    },
    validationHook,
  );
}
