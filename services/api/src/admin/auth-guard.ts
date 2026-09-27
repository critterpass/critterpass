/**
 * Guards every `/v1/admin/*` request: a valid Cloudflare Access assertion (when Access is
 * configured), then — for everything but the sign-in endpoints — a live console session that is
 * under 12 h old, belongs to an allow-listed, unbanned user holding at least one console role, and
 * stays within the per-operator rate limit. Resolves the operator into `c.var.admin`.
 */
import { DomainError, parseAdminRoles, verifyAdminCliToken } from '@cp/domain';
import type { MiddlewareHandler } from 'hono';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import { enforceUidRateLimit } from '../commands/_framework/session';
import type { AccessVerifier } from './access';
import type { AdminAllowlist } from './allowlist';
import { hashAdminIp } from './audit';
import { ADMIN_AUTH_BASE_PATH, ADMIN_SESSION_SECONDS } from './auth';
import type { OperatorStore } from './operators';
import type { AdminIdentity } from './registry';

/** `x-cp-client-ip` is set by the admin Worker from `cf-connecting-ip`; `x-real-ip` by Railway. */
export const ADMIN_CLIENT_IP_HEADERS = ['x-cp-client-ip', 'x-real-ip'] as const;

export interface AdminSessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role?: string | null | undefined;
  readonly banned?: boolean | null | undefined;
}

export interface AdminSessionLookup {
  getSession(args: { headers: Headers }): Promise<{
    user: AdminSessionUser;
    session: { createdAt: Date; expiresAt: Date };
  } | null>;
}

export interface AdminGuardDeps {
  readonly sessions: AdminSessionLookup;
  readonly allowlist: AdminAllowlist;
  readonly redis: RateLimitRedisClient;
  /** Absent only where Access is not configured (local development, tests of the other checks). */
  readonly access?: AccessVerifier | undefined;
  readonly ipHashSecret: string;
  /** The emergency CLI door: owner tokens signed with this secret, owners looked up here. */
  readonly cli?: { readonly secret: string; readonly operators: OperatorStore } | undefined;
  readonly now?: () => Date;
}

export type AdminVariables = { admin: AdminIdentity };

const ADMIN_RATE_RULE = { windowSeconds: 60, max: 300 };

function clientIp(headers: Headers): string | null {
  for (const name of ADMIN_CLIENT_IP_HEADERS) {
    const value = headers.get(name);
    if (value !== null && value.length > 0) return value.split(',')[0]?.trim() ?? null;
  }
  return null;
}

/** Resolves and checks the operator behind a request; throws the wire error when refused. */
export async function resolveAdmin(deps: AdminGuardDeps, headers: Headers): Promise<AdminIdentity> {
  const found = await deps.sessions.getSession({ headers });
  if (found === null) throw new DomainError('AUTH_REQUIRED');
  const now = (deps.now ?? (() => new Date()))();
  const absoluteEnd = new Date(found.session.createdAt.getTime() + ADMIN_SESSION_SECONDS * 1000);
  const expiresAt = found.session.expiresAt < absoluteEnd ? found.session.expiresAt : absoluteEnd;
  if (expiresAt <= now) throw new DomainError('AUTH_REQUIRED', { reason: 'session_expired' });

  const { user } = found;
  if (!deps.allowlist.allows(user.email)) {
    throw new DomainError('FORBIDDEN', { reason: 'not_allow_listed' });
  }
  if (user.banned === true) throw new DomainError('FORBIDDEN', { reason: 'banned' });
  const roles = parseAdminRoles(user.role);
  if (roles.length === 0) throw new DomainError('FORBIDDEN', { reason: 'no_role' });

  await enforceUidRateLimit(deps.redis, 'admin', user.id, ADMIN_RATE_RULE);
  return {
    uid: user.id,
    email: user.email,
    name: user.name,
    roles,
    sessionExpiresAt: expiresAt,
    ipHash: hashAdminIp(deps.ipHashSecret, clientIp(headers)),
  };
}

const CLI_SCHEME = 'CP-Admin-CLI ';

/**
 * The emergency CLI (`apps/admin/scripts/cmd.ts`): a signed owner token of at most 5 minutes, for
 * commands only. The same allow-list, ban and role checks apply as for a session, plus `owner`.
 */
export async function resolveCliAdmin(
  deps: AdminGuardDeps,
  headers: Headers,
  token: string,
): Promise<AdminIdentity> {
  if (deps.cli === undefined) throw new DomainError('AUTH_REQUIRED', { reason: 'cli_disabled' });
  const now = (deps.now ?? (() => new Date()))();
  const claims = await verifyAdminCliToken(token, deps.cli.secret, now);
  if (claims === null) throw new DomainError('AUTH_REQUIRED', { reason: 'cli_token' });
  const operator = await deps.cli.operators.byEmail(claims.email);
  if (operator === null || !deps.allowlist.allows(operator.email)) {
    throw new DomainError('FORBIDDEN', { reason: 'not_allow_listed' });
  }
  if (operator.banned === true) throw new DomainError('FORBIDDEN', { reason: 'banned' });
  if (!operator.roles.includes('owner'))
    throw new DomainError('FORBIDDEN', { reason: 'not_owner' });
  await enforceUidRateLimit(deps.redis, 'admin', operator.id, ADMIN_RATE_RULE);
  return {
    uid: operator.id,
    email: operator.email,
    name: operator.name,
    roles: operator.roles,
    sessionExpiresAt: new Date(claims.exp * 1000),
    ipHash: hashAdminIp(deps.ipHashSecret, clientIp(headers)),
  };
}

export function adminGuard(deps: AdminGuardDeps): MiddlewareHandler<{ Variables: AdminVariables }> {
  return async (c, next) => {
    if (deps.access !== undefined) await deps.access(c.req.raw.headers);
    if (c.req.path.startsWith(`${ADMIN_AUTH_BASE_PATH}/`)) {
      await next();
      return;
    }
    const authorization = c.req.header('authorization');
    if (authorization?.startsWith(CLI_SCHEME)) {
      if (c.req.method !== 'POST' || !c.req.path.startsWith('/v1/admin/cmd/')) {
        throw new DomainError('FORBIDDEN', { reason: 'cli_commands_only' });
      }
      c.set(
        'admin',
        await resolveCliAdmin(deps, c.req.raw.headers, authorization.slice(CLI_SCHEME.length)),
      );
    } else {
      c.set('admin', await resolveAdmin(deps, c.req.raw.headers));
    }
    await next();
  };
}
