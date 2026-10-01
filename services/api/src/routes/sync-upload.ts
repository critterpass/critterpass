/**
 * `POST /sync/upload` (docs/api-contracts.md §2.2, §5.2): the offline door PowerSync's
 * `uploadData` flushes its queue through. Ops run in order, each in its own transaction:
 * - business/validation rejects are recorded in `cmd_results` and the batch continues (2xx);
 * - the first transient failure stops the batch with 503 and `detail.first_unprocessed`, so the
 *   client retries from there; ops before it already committed and replay as `duplicate`;
 * - a command that hits a data or integrity error in Postgres (SQLSTATE class 22 or 23) can never
 *   succeed on a retry: it is answered as rejected (INTERNAL, not retryable) and the batch goes on,
 *   so one broken command never holds every later write on the phone behind it.
 */
import { executeCommand } from '@cp/db';
import { DomainError } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import {
  CommandOutcomeSchema,
  ErrorBodySchema,
  outcomeBody,
  validationHook,
  type CommandDoorDeps,
  type CommandOutcomeBody,
} from '../commands/_framework/doors';
import {
  enforceUidRateLimit,
  requireCommandSession,
  SYNC_UPLOAD_PER_UID_RULE,
} from '../commands/_framework/session';

/** Batch cap; the app-wide 1 MB body limit bounds the batch's bytes. */
export const MAX_SYNC_BATCH_OPS = 500;

const SyncUploadResultSchema = z
  .object({ results: z.array(CommandOutcomeSchema) })
  .openapi('SyncUploadResult');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const syncUploadRoute = createRoute({
  method: 'post',
  path: '/sync/upload',
  tags: ['commands'],
  summary: 'Upload an ordered batch of offline command envelopes',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ ops: z.array(z.unknown()) }).openapi('SyncUploadBatch'),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Every op has an outcome (applied, rejected or duplicate), in batch order',
      content: { 'application/json': { schema: SyncUploadResultSchema } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    413: errorResponse('PAYLOAD_TOO_LARGE: more than 500 ops or 1 MB'),
    422: errorResponse('VALIDATION'),
    429: errorResponse('RATE_LIMITED'),
    503: errorResponse(
      'Transient failure; retry from detail.first_unprocessed (detail.results covers the ops before it)',
    ),
  },
});

function unusableEnvelope(index: number, error: DomainError): CommandOutcomeBody {
  // No usable op_id means nothing could be recorded; the index lets the client drop that entry.
  return {
    op_id: '',
    status: 'rejected',
    code: error.code,
    detail: { index, ...(typeof error.detail === 'object' ? error.detail : {}) },
  };
}

/** Postgres data exceptions (class 22) and integrity violations (class 23): retrying cannot help. */
export function isUnretryableDatabaseError(error: unknown): boolean {
  if (error instanceof DomainError || typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^2[23][0-9A-Z]{3}$/u.test(code);
}

function unprocessable(op: unknown): CommandOutcomeBody {
  const opId = (op as { op_id?: unknown } | null)?.op_id;
  return {
    op_id: typeof opId === 'string' ? opId : '',
    status: 'rejected',
    code: 'INTERNAL',
    detail: { reason: 'unprocessable' },
  };
}

export function registerSyncUploadRoute(app: OpenAPIHono<AppEnv>, deps: CommandDoorDeps): void {
  app.openapi(
    syncUploadRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      await enforceUidRateLimit(deps.redis, 'sync', session.uid, SYNC_UPLOAD_PER_UID_RULE);

      const { ops } = c.req.valid('json');
      if (ops.length > MAX_SYNC_BATCH_OPS) {
        throw new DomainError('PAYLOAD_TOO_LARGE', { max_ops: MAX_SYNC_BATCH_OPS });
      }

      const results: CommandOutcomeBody[] = [];
      for (const [index, op] of ops.entries()) {
        try {
          const outcome = await executeCommand(op, {
            pool: deps.pool,
            resolve: deps.registry.resolve,
            actor: { kind: 'user', uid: session.uid, isAnonymous: session.isAnonymous },
            door: 'sync',
          });
          results.push(outcomeBody(outcome));
        } catch (error) {
          if (error instanceof DomainError && !error.retryable) {
            results.push(unusableEnvelope(index, error));
            continue;
          }
          if (isUnretryableDatabaseError(error)) {
            deps.logger.error(
              { err: error, uid: session.uid, index },
              'sync upload command rejected: it cannot succeed on a retry',
            );
            results.push(unprocessable(op));
            continue;
          }
          deps.logger.error(
            { err: error, uid: session.uid, index, processed: results.length },
            'sync upload interrupted',
          );
          const code = error instanceof DomainError ? error.code : 'INTERNAL';
          return c.json(
            {
              error: {
                code,
                message: 'Batch interrupted; retry from first_unprocessed',
                retryable: true,
                detail: { first_unprocessed: index, results },
              },
            },
            503,
          );
        }
      }
      return c.json({ results }, 200);
    },
    validationHook,
  );
}
