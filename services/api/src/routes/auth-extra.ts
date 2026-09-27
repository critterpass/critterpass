/**
 * Auth routes that are not Better Auth endpoints (docs/api-contracts.md §5.1): the attestation
 * challenge, SIWA authorization-code capture, and (added by later tasks in this same file)
 * `/v1/auth/merge-ticket` / `/v1/auth/merge`.
 */
import { z } from 'zod';
import type { Context, Hono } from 'hono';

import { crypto as dbCrypto } from '@cp/db';
import { DomainError, type ErrorResponseBody } from '@cp/domain';

import { issueChallenge, type ChallengeRedisClient } from '../abuse/attestation';
import {
  exchangeAppleAuthorizationCode,
  type AppleClientSecretConfig,
  type AppleHttpClient,
} from '../auth/social/apple';
import type { AuthInstance } from '../auth/config';

const { encryptField } = dbCrypto;
type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

export interface AuthExtraDeps {
  readonly redis: ChallengeRedisClient;
}

const challengeBodySchema = z.object({
  installId: z.uuid(),
});

function errorResponse(c: Context, error: DomainError) {
  const body: ErrorResponseBody = error.toResponseBody();
  return c.json(body, error.http as never);
}

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

export interface AppleAuthorizationCodeDeps {
  readonly auth: AuthInstance;
  readonly clientSecretConfig: AppleClientSecretConfig;
  readonly redirectUri: string;
  readonly http: AppleHttpClient;
  readonly keyring: FieldEncryptionKeyring;
}

interface InternalAdapterAccount {
  readonly id: string;
  readonly providerId: string;
}

interface InternalAdapterLike {
  findAccountByUserId(userId: string): Promise<InternalAdapterAccount[]>;
  updateAccount(id: string, data: Record<string, unknown>): Promise<unknown>;
}

const authorizationCodeBodySchema = z.object({
  authorizationCode: z.string().min(1),
});

/**
 * `POST /v1/auth/apple/authorization-code` (docs/data-model.md §3.1): captures the one-time SIWA
 * `authorizationCode` the client got alongside its ID token, exchanges it for a refresh token, and
 * stores it AES-256-GCM encrypted on the caller's own `auth.account` row (`revokeApple`,
 * services/api/src/auth/social/revoke.ts, reads it back later for deletion/unlink). Requires an
 * authenticated session that already linked Apple (`link-social`/`sign-in/social` runs first) — the
 * authorization code alone proves nothing about which uid it belongs to.
 */
export function registerAppleAuthorizationCodeRoute<E extends { Variables: object }>(
  app: Hono<E>,
  deps: AppleAuthorizationCodeDeps,
): void {
  app.post('/v1/auth/apple/authorization-code', async (c) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return errorResponse(c, new DomainError('AUTH_REQUIRED'));

    const parsed = authorizationCodeBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return errorResponse(c, new DomainError('VALIDATION', { issues: parsed.error.issues }));
    }

    const context = (await deps.auth.$context) as unknown as {
      internalAdapter: InternalAdapterLike;
    };
    const accounts = await context.internalAdapter.findAccountByUserId(session.user.id);
    const appleAccount = accounts.find((account) => account.providerId === 'apple');
    if (!appleAccount) {
      return errorResponse(
        c,
        new DomainError('VALIDATION', { reason: 'no linked apple account for this session' }),
      );
    }

    const tokens = await exchangeAppleAuthorizationCode(
      { authorizationCode: parsed.data.authorizationCode, redirectUri: deps.redirectUri },
      deps.clientSecretConfig,
      deps.http,
    );
    if (!tokens.refresh_token) {
      return errorResponse(
        c,
        new DomainError('VALIDATION', { reason: 'apple returned no refresh token' }),
      );
    }

    await context.internalAdapter.updateAccount(appleAccount.id, {
      refreshToken: encryptField(tokens.refresh_token, deps.keyring),
    });
    return c.json({ captured: true });
  });
}
