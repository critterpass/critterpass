/**
 * Auth routes that are not Better Auth endpoints (docs/api-contracts.md §5.1). Only the attestation
 * challenge lands here so far; `/v1/auth/merge-ticket`, `/v1/auth/merge` and
 * `/v1/auth/apple/authorization-code` are later tasks' additions to this same file.
 */
import { z } from 'zod';
import type { Hono } from 'hono';

import { DomainError, type ErrorResponseBody } from '@cp/domain';

import { issueChallenge, type ChallengeRedisClient } from '../abuse/attestation';

export interface AuthExtraDeps {
  readonly redis: ChallengeRedisClient;
}

const challengeBodySchema = z.object({
  installId: z.uuid(),
});

export function registerAuthExtraRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  deps: AuthExtraDeps,
): void {
  app.post('/v1/attest/challenge', async (c) => {
    const parsed = challengeBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const error = new DomainError('VALIDATION', { issues: parsed.error.issues });
      const body: ErrorResponseBody = error.toResponseBody();
      return c.json(body, 422);
    }
    const { challenge } = await issueChallenge(deps.redis, parsed.data.installId);
    return c.json({ challenge });
  });
}
