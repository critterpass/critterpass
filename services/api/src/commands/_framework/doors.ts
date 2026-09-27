/**
 * What the HTTP command doors share: their dependencies, the OpenAPI schemas of the envelope and
 * of the error body, and the zod-openapi validation hook that turns a malformed request into the
 * wire `VALIDATION` error (docs/api-contracts.md §3) instead of zod-openapi's default 400.
 */
import type { CommandOutcome } from '@cp/domain';
import { DomainError } from '@cp/domain';
import { z } from '@hono/zod-openapi';
import type pg from 'pg';
import type { Logger } from 'pino';

import type { RateLimitRedisClient } from '../../abuse/rate-limits';
import type { CommandRegistry } from './registry';
import type { SessionResolver } from './session';

export interface CommandDoorDeps {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly logger: Pick<Logger, 'error'>;
}

export const ErrorBodySchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
      detail: z.unknown().optional(),
    }),
  })
  .openapi('ErrorBody');

export const CommandEnvelopeSchema = z
  .object({
    op_id: z.string().openapi({ description: 'Client UUIDv7; the idempotency key' }),
    cmd: z.string(),
    v: z.literal(1),
    actor: z.object({ uid: z.string(), via: z.string() }),
    device: z.object({
      id: z.string(),
      platform: z.string(),
      app_version: z.string(),
      tz: z.string(),
    }),
    client_ts: z.string(),
    base_version: z.number().int().optional(),
    payload: z.unknown(),
  })
  .openapi('CommandEnvelope', {
    description: 'Every field is validated by the command pipeline itself (api-contracts §2.1)',
  });

export const CommandOutcomeSchema = z
  .object({
    op_id: z.string(),
    status: z.enum(['applied', 'rejected', 'duplicate']),
    code: z.string().optional(),
    detail: z.unknown().optional(),
    result: z.unknown().optional(),
  })
  .openapi('CommandOutcome');
export type CommandOutcomeBody = z.infer<typeof CommandOutcomeSchema>;

export function outcomeBody(outcome: CommandOutcome): CommandOutcomeBody {
  switch (outcome.status) {
    case 'applied':
      return { op_id: outcome.opId, status: 'applied', result: outcome.result };
    case 'rejected':
      return {
        op_id: outcome.opId,
        status: 'rejected',
        code: outcome.code,
        ...(outcome.detail !== undefined ? { detail: outcome.detail } : {}),
      };
    case 'duplicate':
      return {
        op_id: outcome.opId,
        status: 'duplicate',
        result: outcome.result,
        ...(outcome.code !== undefined ? { code: outcome.code } : {}),
        ...(outcome.detail !== undefined ? { detail: outcome.detail } : {}),
      };
  }
}

/** zod-openapi hook: a request that fails its route schema becomes `VALIDATION` with the issues. */
export function validationHook(result: { success: boolean; error?: z.ZodError }): undefined {
  if (!result.success && result.error !== undefined) {
    throw new DomainError('VALIDATION', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map(String),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  return undefined;
}
