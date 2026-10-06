/**
 * The driver's claim page api (`/v1/public/driver-claims/{key}`, docs/api-contracts.md §5 public
 * routes): no account, the key in the link is the credential. Saying yes, and getting a fresh key
 * for a used link, need a 6-digit code sent by WhatsApp to the invited number, so "Verified" on the
 * page is true and nobody else can list him. Rate-limited per key and IP; codes live in Redis for
 * 10 minutes, hashed, with five tries.
 */
import { createHash, randomInt } from 'node:crypto';

import { withSystem } from '@cp/db';
import {
  DomainError,
  driverClaimConfirmSchema,
  driverListingPatchSchema,
  driverListingPauseSchema,
  maskDriverPhone,
  type DriverClaimView,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type pg from 'pg';
import { z } from 'zod';

import { checkRateLimit, hashForRateLimitKey } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  invitedPhone,
  inviteView,
  listingPhone,
  listingView,
  resolveKey,
  type ResolvedKey,
} from '../commands/driver-directory/claim-store';
import {
  confirmClaim,
  declineInvite,
  removeListing,
  rotateKey,
  updateListing,
} from '../commands/driver-directory/claim-writes';
import type { DriverDirectoryDeps } from '../commands/driver-directory/shared';

/** Sends the code over WhatsApp; `fixedCode` answers the store-review and test numbers. */
export interface OtpSender {
  send(phoneE164: string, code: string): Promise<void>;
  fixedCode(phoneE164: string): string | undefined;
}

export interface ClaimRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX: number }): Promise<unknown>;
  del(key: string): Promise<number>;
}

export interface PublicDriverClaimDeps {
  readonly pool: pg.Pool;
  readonly redis: ClaimRedis;
  readonly logger: { warn(details: object, message: string): void };
  readonly otp: OtpSender | null;
  readonly deps: DriverDirectoryDeps;
}

const CODE_TTL_S = 600;
const CODE_TRIES = 5;
const REQUESTS_RULE = { windowSeconds: 600, max: 60 };
const OTP_RULE = { windowSeconds: 3600, max: 4 };

function clientIp(c: Context): string {
  return (
    c.req.header('x-cp-client-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function registerPublicDriverClaimRoutes(
  app: OpenAPIHono<AppEnv>,
  route: PublicDriverClaimDeps,
): void {
  const base = '/v1/public/driver-claims/:key';

  async function guard(c: Context): Promise<string> {
    const key = c.req.param('key') ?? '';
    if (!/^[a-z0-9-]{8,64}$/.test(key)) throw new DomainError('NOT_FOUND');
    const scope = `drvclaim:rl:${hashForRateLimitKey(`${key}|${clientIp(c)}`)}`;
    const decision = await checkRateLimit(route.redis, scope, REQUESTS_RULE);
    if (!decision.allowed) {
      throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
    }
    return key;
  }

  function run<T>(fn: (tx: pg.PoolClient, resolved: ResolvedKey) => Promise<T>, key: string) {
    return withSystem(route.pool, async (tx) => fn(tx, await resolveKey(tx, key, new Date())));
  }

  function codeScope(resolved: ResolvedKey): string {
    if (resolved.kind === 'invite' && resolved.state === 'invited')
      return `invite:${resolved.inviteId}`;
    if (resolved.kind === 'invite' && resolved.state === 'used' && resolved.listingId !== null) {
      return `listing:${resolved.listingId}`;
    }
    throw new DomainError('STATE_INVALID', { state: resolved.state });
  }

  async function verifyCode(scope: string, code: string): Promise<void> {
    const stored = await route.redis.get(`drvclaim:code:${scope}`);
    if (stored === null) throw new DomainError('CODE_EXPIRED');
    const tries = await route.redis.incr(`drvclaim:tries:${scope}`);
    if (tries === 1) await route.redis.expire(`drvclaim:tries:${scope}`, CODE_TTL_S);
    if (tries > CODE_TRIES) throw new DomainError('CODE_EXPIRED', { reason: 'too_many_tries' });
    if (stored !== sha(code)) throw new DomainError('CODE_INVALID');
    await route.redis.del(`drvclaim:code:${scope}`);
    await route.redis.del(`drvclaim:tries:${scope}`);
  }

  function listingOf(resolved: ResolvedKey): string {
    if (resolved.kind !== 'listing' || resolved.state === 'removed') {
      throw new DomainError('STATE_INVALID', { state: resolved.state });
    }
    return resolved.listingId;
  }

  app.get(base, async (c) => {
    const key = await guard(c);
    const view = await run<DriverClaimView>(async (tx, resolved) => {
      if (resolved.kind === 'listing') return listingView(tx, resolved.listingId);
      if (resolved.kind === 'invite' && resolved.state === 'invited') {
        return inviteView(tx, route.deps, resolved.inviteId);
      }
      return { state: resolved.state };
    }, key);
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex');
    return c.json(view);
  });

  app.post(`${base}/otp`, async (c) => {
    const key = await guard(c);
    if (route.otp === null) throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'otp_off' });
    const otp = route.otp;
    const { scope, phone } = await run(async (tx, resolved) => {
      const codeFor = codeScope(resolved);
      const number =
        resolved.kind === 'invite' && resolved.state === 'invited'
          ? await invitedPhone(tx, route.deps, resolved.inviteId)
          : await listingPhone(
              tx,
              route.deps,
              resolved.kind === 'invite' ? (resolved.listingId ?? '') : '',
            );
      return { scope: codeFor, phone: number };
    }, key);
    const limit = await checkRateLimit(route.redis, `drvclaim:otp:${sha(scope)}`, OTP_RULE);
    if (!limit.allowed) throw new DomainError('RATE_LIMITED', { retry_after_s: limit.retryAfterS });
    const code = otp.fixedCode(phone) ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    await route.redis.set(`drvclaim:code:${scope}`, sha(code), { EX: CODE_TTL_S });
    await route.redis.del(`drvclaim:tries:${scope}`);
    if (otp.fixedCode(phone) === undefined) await otp.send(phone, code);
    return c.json({ sent: true, masked_phone: maskDriverPhone(phone) });
  });

  app.post(`${base}/confirm`, async (c) => {
    const key = await guard(c);
    const body = driverClaimConfirmSchema.parse(await c.req.json());
    const view = await run(async (tx, resolved) => {
      if (resolved.kind !== 'invite' || resolved.state !== 'invited') {
        throw new DomainError('STATE_INVALID', { state: resolved.state });
      }
      await verifyCode(codeScope(resolved), body.code);
      return confirmClaim(tx, route.deps, resolved.inviteId, body);
    }, key);
    return c.json(view);
  });

  app.post(`${base}/recover`, async (c) => {
    const key = await guard(c);
    const body = z.strictObject({ code: z.string().regex(/^\d{6}$/) }).parse(await c.req.json());
    const view = await run(async (tx, resolved) => {
      if (resolved.kind !== 'invite' || resolved.state !== 'used' || resolved.listingId === null) {
        throw new DomainError('STATE_INVALID', { state: resolved.state });
      }
      await verifyCode(codeScope(resolved), body.code);
      return listingView(tx, resolved.listingId, await rotateKey(tx, resolved.listingId, 'driver'));
    }, key);
    return c.json(view);
  });

  app.post(`${base}/decline`, async (c) => {
    const key = await guard(c);
    await run(async (tx, resolved) => {
      if (resolved.kind !== 'invite' || resolved.state !== 'invited') {
        throw new DomainError('STATE_INVALID', { state: resolved.state });
      }
      await declineInvite(tx, resolved.inviteId);
    }, key);
    return c.json({ state: 'declined' });
  });

  app.patch(`${base}/listing`, async (c) => {
    const key = await guard(c);
    const body = driverListingPatchSchema.parse(await c.req.json());
    const view = await run((tx, resolved) => updateListing(tx, listingOf(resolved), body), key);
    return c.json(view);
  });

  app.post(`${base}/pause`, async (c) => {
    const key = await guard(c);
    const body = driverListingPauseSchema.parse(await c.req.json());
    const view = await run(
      (tx, resolved) => updateListing(tx, listingOf(resolved), { paused: body.paused }),
      key,
    );
    return c.json(view);
  });

  app.delete(`${base}/listing`, async (c) => {
    const key = await guard(c);
    await run((tx, resolved) => removeListing(tx, listingOf(resolved)), key);
    return c.json({ state: 'removed' });
  });
}
