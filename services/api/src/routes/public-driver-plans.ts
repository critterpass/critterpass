/**
 * The driver's no-login routes (docs/api-contracts.md §5, doc delta):
 * - `GET /v1/public/driver-plans/{token}`: the plan for the shared days (the driver projection
 *   only), the page's state, and a human open counts towards the crew's open count.
 * - `POST /v1/public/driver-plans/{token}/reply`: a quote, a suggested order and tips; rate-limited
 *   per link and per visitor.
 * A revoked or expired link answers `SHARE_REVOKED` / `SHARE_EXPIRED` with the switched-off facts
 * at once: nothing here is cached (`private, no-store`). The web Worker calls these server-side
 * with the shared proxy secret, so limits apply to the visitor, not the Worker.
 */
import { timingSafeEqual } from 'node:crypto';

import { withSystem } from '@cp/db';
import { DomainError, driverPlanReplyPayloadSchema, type DriverPlanPage } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';

import type { RateLimitRedisClient, RateLimitRule } from '../abuse/rate-limits';
import { checkRateLimit } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { asSystemRole } from '../admin/command';
import { isHumanLinkOpen } from '../links/bot-filter';
import { hashForLog } from '../links/redact';
import { publishPlan } from '../plan/changeset-store';
import { submitDriverReply } from '../commands/driver-plan-shares/reply';
import {
  assertShareLive,
  buildDriverView,
  loadShare,
  shareTokenHash,
} from '../commands/driver-plan-shares/store';
import type pg from 'pg';

export const PAGE_PER_IP_RULE: RateLimitRule = { windowSeconds: 60, max: 60 };
export const REPLY_PER_TOKEN_RULE: RateLimitRule = { windowSeconds: 3600, max: 10 };
export const REPLY_PER_IP_RULE: RateLimitRule = { windowSeconds: 3600, max: 30 };
/** Request bodies past this never reach the parser. */
const MAX_REPLY_BYTES = 32 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;

export interface PublicDriverPlanDeps {
  readonly pool: pg.Pool;
  readonly redis: RateLimitRedisClient;
  readonly webProxySecret?: string | undefined;
  readonly now?: () => Date;
}

function secretMatches(given: string | undefined, expected: string | undefined): boolean {
  if (given === undefined || expected === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function visitorOf(c: Context<AppEnv>, deps: PublicDriverPlanDeps) {
  if (secretMatches(c.req.header('x-cp-web-proxy'), deps.webProxySecret)) {
    return {
      ip: c.req.header('x-cp-visitor-ip') ?? 'unknown',
      userAgent: c.req.header('x-cp-visitor-ua'),
    };
  }
  return { ip: c.req.header('x-real-ip') ?? 'unknown', userAgent: c.req.header('user-agent') };
}

async function enforce(redis: RateLimitRedisClient, key: string, rule: RateLimitRule) {
  const decision = await checkRateLimit(redis, key, rule);
  if (!decision.allowed)
    throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
}

function tokenOf(c: Context<AppEnv>): string {
  const token = c.req.param('token') ?? '';
  if (!TOKEN_PATTERN.test(token)) throw new DomainError('NOT_FOUND', { reason: 'driver_plan' });
  return token;
}

export function registerPublicDriverPlanRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: PublicDriverPlanDeps,
): void {
  const now = deps.now ?? (() => new Date());

  app.get('/v1/public/driver-plans/:token', async (c) => {
    const visitor = visitorOf(c, deps);
    await enforce(deps.redis, `rl:driver-plan:page:ip:${visitor.ip}`, PAGE_PER_IP_RULE);
    const token = tokenOf(c);
    const at = now();
    const humanOpen = isHumanLinkOpen({
      method: c.req.method,
      userAgent: visitor.userAgent,
      ip: visitor.ip,
      purpose: c.req.header('sec-purpose') ?? c.req.header('purpose') ?? c.req.header('x-purpose'),
    });
    const page = await withSystem(deps.pool, async (tx): Promise<DriverPlanPage> => {
      const share = await assertShareLive(
        tx,
        await loadShare(tx, { tokenHash: shareTokenHash(token) }),
        at,
      );
      const { view, versionId } = await buildDriverView(tx, share);
      const facts = await asSystemRole(tx, () =>
        tx.query<{ version_at: Date; reply_at: Date | null }>(
          `SELECT v.created_at AS version_at,
                  (SELECT max(r.created_at) FROM driver_plan_replies r
                     LEFT JOIN change_sets cs ON cs.id = r.change_set_id
                    WHERE r.share_id = $2 AND r.status = 'open'
                      AND (cs.id IS NULL OR cs.status IN ('proposed', 'voting'))) AS reply_at
             FROM itinerary_versions v WHERE v.id = $1`,
          [versionId, share.id],
        ),
      );
      if (humanOpen) {
        await tx.query(
          `UPDATE driver_plan_shares SET open_count = open_count + 1, last_opened_at = $2
            WHERE id = $1`,
          [share.id, at],
        );
        await publishPlan(tx, share.trip_id, 'driver_share.opened', {
          share_id: share.id,
          open_count: share.open_count + 1,
          last_opened_at: at.toISOString(),
        });
      }
      const row = facts.rows[0];
      return {
        view,
        allow_quote: share.allow_quote,
        expires_at: share.expires_at.toISOString(),
        updated_at:
          versionId !== share.itinerary_version_id && row ? row.version_at.toISOString() : null,
        open_reply_at: row?.reply_at?.toISOString() ?? null,
      };
    });
    c.header('cache-control', 'private, no-store');
    c.header('x-robots-tag', 'noindex, nofollow');
    return c.json(page, 200);
  });

  app.post('/v1/public/driver-plans/:token/reply', async (c) => {
    const visitor = visitorOf(c, deps);
    const token = tokenOf(c);
    await enforce(deps.redis, `rl:driver-plan:reply:ip:${visitor.ip}`, REPLY_PER_IP_RULE);
    await enforce(
      deps.redis,
      `rl:driver-plan:reply:token:${hashForLog(token)}`,
      REPLY_PER_TOKEN_RULE,
    );
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_REPLY_BYTES)
      throw new DomainError('PAYLOAD_TOO_LARGE');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new DomainError('VALIDATION', { reason: 'json' });
    }
    const parsed = driverPlanReplyPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new DomainError('VALIDATION', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const outcome = await withSystem(deps.pool, (tx) =>
      submitDriverReply(tx, token, parsed.data, now()),
    );
    c.header('cache-control', 'private, no-store');
    return c.json(outcome, 200);
  });
}
