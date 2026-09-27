/**
 * Session and per-uid rate limiting for the command doors (docs/api-contracts.md §1 "Auth header",
 * "Rate limits"). The doors depend on this narrow resolver, not on Better Auth's generated API, so
 * the same routes serve any caller that can say who a request is from.
 */
import { DomainError } from '@cp/domain';

import {
  checkRateLimit,
  type RateLimitRedisClient,
  type RateLimitRule,
} from '../../abuse/rate-limits';

export interface CommandSession {
  readonly uid: string;
  readonly isAnonymous: boolean;
}

export type SessionResolver = (headers: Headers) => Promise<CommandSession | null>;

/** The one Better Auth call the doors need (`auth.api.getSession`). */
export interface SessionApi {
  getSession(args: { headers: Headers }): Promise<{
    user: { id: string; isAnonymous?: boolean | null };
  } | null>;
}

export function betterAuthSessionResolver(api: SessionApi): SessionResolver {
  return async (headers) => {
    const session = await api.getSession({ headers });
    if (session === null) return null;
    return { uid: session.user.id, isAnonymous: session.user.isAnonymous === true };
  };
}

/** `AUTH_REQUIRED` when the request carries no live session (missing, expired or revoked). */
export async function requireCommandSession(
  resolve: SessionResolver,
  headers: Headers,
): Promise<CommandSession> {
  const session = await resolve(headers);
  if (session === null) throw new DomainError('AUTH_REQUIRED');
  return session;
}

/** Single commands: generous for a burst of taps, tight enough to stop a runaway client. */
export const CMD_PER_UID_RULE: RateLimitRule = { windowSeconds: 60, max: 120 };
/** Offline batches: each carries up to 500 ops, so a handful per minute drains any real queue. */
export const SYNC_UPLOAD_PER_UID_RULE: RateLimitRule = { windowSeconds: 60, max: 30 };
export const CMD_RESULTS_PER_UID_RULE: RateLimitRule = { windowSeconds: 60, max: 60 };

/** `RATE_LIMITED` with `retry_after_s` once `uid` exceeds `rule` on this door. */
export async function enforceUidRateLimit(
  redis: RateLimitRedisClient,
  door: string,
  uid: string,
  rule: RateLimitRule,
): Promise<void> {
  const decision = await checkRateLimit(redis, `rl:${door}:uid:${uid}`, rule);
  if (!decision.allowed) {
    throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
  }
}
