/**
 * The api's internal billing door (`POST /internal/billing/{op}`): the worker's billing jobs carry
 * the durable retry, the api runs the step (it owns the RevenueCat client and the entitlement
 * materialiser, and services never import each other). Reachable over the private network only,
 * with a shared secret compared in constant time. A step either succeeds (200 with its result),
 * fails for good (422: the job records it and stops) or fails for now (503/500: the job retries).
 */
import { timingSafeEqual } from 'node:crypto';

import {
  BILLING_INTERNAL_OPS,
  BILLING_INTERNAL_SECRET_HEADER,
  billingInternalBodySchemas,
  DomainError,
  type BillingInternalOp,
} from '@cp/domain';
import type { Hono } from 'hono';

export type BillingOpHandler = (body: unknown) => Promise<unknown>;

export interface BillingDoorDeps {
  readonly secret: string;
  readonly ops: Partial<Record<BillingInternalOp, BillingOpHandler>>;
  readonly onError?: (error: unknown, op: string) => void;
}

function secretMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const isOp = (op: string): op is BillingInternalOp =>
  (BILLING_INTERNAL_OPS as readonly string[]).includes(op);

export function registerBillingDoor<E extends { Variables: object }>(
  app: Hono<E>,
  deps: BillingDoorDeps,
): void {
  app.post('/internal/billing/:op', async (c) => {
    if (!secretMatches(deps.secret, c.req.header(BILLING_INTERNAL_SECRET_HEADER))) {
      return c.json(
        { error: { code: 'AUTH_REQUIRED', message: 'forbidden', retryable: false } },
        401,
      );
    }
    const op = c.req.param('op');
    const handler = isOp(op) ? deps.ops[op] : undefined;
    if (!isOp(op) || handler === undefined) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'unknown op', retryable: false } }, 404);
    }
    const body = billingInternalBodySchemas[op].safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(
        { error: { code: 'VALIDATION', message: 'invalid body', retryable: false } },
        422,
      );
    }
    try {
      return c.json({ result: await handler(body.data) });
    } catch (error) {
      deps.onError?.(error, op);
      if (error instanceof DomainError) {
        const retry =
          error.retryable ||
          (error.code === 'STATE_INVALID' &&
            (error.detail as { reason?: string } | undefined)?.reason === 'store_unverifiable');
        return c.json(
          {
            error: {
              code: error.code,
              message: error.code,
              retryable: retry,
              detail: error.detail,
            },
          },
          retry ? 503 : 422,
        );
      }
      return c.json({ error: { code: 'INTERNAL', message: 'internal', retryable: true } }, 500);
    }
  });
}
