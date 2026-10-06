/**
 * Link endpoints (docs/api-contracts.md §5.6):
 * - `GET /v1/links/{token}/preview`: public, bot-filtered, 60/min/IP; the first human open of an
 *   invite appends `invite.opened`.
 * - `GET /v1/codes/{code}`: public code lookup, 10/min/IP and 30/h/device; anything but a live code
 *   is the same 404, so codes cannot be enumerated by their answers.
 * - `POST /v1/links/claim`: a `claim_attribution` envelope from a signed-in (anonymous allowed)
 *   session, run through the system door for that uid.
 * - `GET /v1/links/settings`: public link switches (the App Clip flag) for the web Worker.
 * The web handoff pages call the first two server-side; with the shared proxy secret they pass the
 * visitor's own IP and user agent, so limits and bot filtering apply to the visitor, not the Worker.
 */
import { timingSafeEqual } from 'node:crypto';

import { executeCommand } from '@cp/db';
import {
  APP_CLIP_FLAG_KEY,
  codeLookupResponseSchema,
  DomainError,
  LINK_CHANNELS,
  LINK_KINDS,
  LINK_PATH_PREFIXES,
  linkPath,
  linkPreviewSchema,
  linkSettingsSchema,
  normalizeJoinCode,
  parseLinkPath,
  type LinkChannel,
} from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';

import type { RateLimitRedisClient, RateLimitRule } from '../abuse/rate-limits';
import { checkRateLimit } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  CommandEnvelopeSchema,
  CommandOutcomeSchema,
  ErrorBodySchema,
  outcomeBody,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import { CLAIM_ATTRIBUTION } from '../commands/attribution/claim-attribution';
import { isHumanLinkOpen } from '../links/bot-filter';
import { hashForLog } from '../links/redact';
import { previewLink, type FirstOpenStore } from '../links/preview';
import type { LinkProviderRegistry } from '../links/registry';
import type { ServerAnalytics } from '../obs/analytics';

export const PREVIEW_PER_IP_RULE: RateLimitRule = { windowSeconds: 60, max: 60 };
export const CODE_LOOKUP_PER_IP_RULE: RateLimitRule = { windowSeconds: 60, max: 10 };
export const CODE_LOOKUP_PER_DEVICE_RULE: RateLimitRule = { windowSeconds: 3600, max: 30 };
export const CLAIM_PER_DEVICE_RULE: RateLimitRule = { windowSeconds: 3600, max: 20 };

export interface LinkRouteDeps extends CommandDoorDeps {
  readonly redis: RateLimitRedisClient & FirstOpenStore;
  readonly links: LinkProviderRegistry;
  /** Shared with the web Worker; absent means visitor headers are never trusted. */
  readonly webProxySecret?: string | undefined;
  /** `link_clicked` for every resolved preview (anonymous, with `is_bot`). */
  readonly analytics?: Pick<ServerAnalytics, 'serverTrack'>;
}

interface Visitor {
  readonly ip: string;
  readonly userAgent: string | undefined;
}

function isLinkChannel(value: string | undefined): value is LinkChannel {
  return (LINK_CHANNELS as readonly (string | undefined)[]).includes(value);
}

function secretMatches(given: string | undefined, expected: string | undefined): boolean {
  if (given === undefined || expected === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function visitorOf(
  c: Context<AppEnv>,
  deps: Pick<LinkRouteDeps, 'webProxySecret'>,
): Visitor {
  if (secretMatches(c.req.header('x-cp-web-proxy'), deps.webProxySecret)) {
    return {
      ip: c.req.header('x-cp-visitor-ip') ?? 'unknown',
      userAgent: c.req.header('x-cp-visitor-ua'),
    };
  }
  return { ip: c.req.header('x-real-ip') ?? 'unknown', userAgent: c.req.header('user-agent') };
}

export async function enforce(redis: RateLimitRedisClient, key: string, rule: RateLimitRule) {
  const decision = await checkRateLimit(redis, key, rule);
  if (!decision.allowed) {
    throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
  }
}

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const previewRoute = createRoute({
  method: 'get',
  path: '/v1/links/{token}/preview',
  tags: ['links'],
  summary: 'Public-safe preview of a link target',
  request: {
    params: z.object({ token: z.string().min(1).max(128) }),
    query: z.object({
      kind: z.enum(LINK_KINDS).default('invite'),
      seat: z.string().max(64).optional(),
      c: z.enum(LINK_CHANNELS).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Preview',
      content: { 'application/json': { schema: linkPreviewSchema } },
    },
    404: errorResponse('NOT_FOUND: unknown or malformed link'),
    429: errorResponse('RATE_LIMITED'),
  },
});

const codeRoute = createRoute({
  method: 'get',
  path: '/v1/codes/{code}',
  tags: ['links'],
  summary: 'Look up a live join code',
  request: { params: z.object({ code: z.string().min(1).max(32) }) },
  responses: {
    200: {
      description: 'The live code and its preview',
      content: {
        'application/json': { schema: codeLookupResponseSchema },
      },
    },
    404: errorResponse('NOT_FOUND: any code that is not live, uniformly'),
    429: errorResponse('RATE_LIMITED'),
  },
});

const claimRoute = createRoute({
  method: 'post',
  path: '/v1/links/claim',
  tags: ['links'],
  summary: 'Claim the link a fresh install came from (claim_attribution)',
  request: {
    body: { required: true, content: { 'application/json': { schema: CommandEnvelopeSchema } } },
  },
  responses: {
    200: {
      description: 'Claimed, or a replay of an earlier claim',
      content: { 'application/json': { schema: CommandOutcomeSchema } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    409: errorResponse('STATE_INVALID (phone not verified) / IDEMPOTENCY_MISMATCH'),
    422: errorResponse('VALIDATION / CODE_INVALID'),
    429: errorResponse('RATE_LIMITED'),
  },
});

const settingsRoute = createRoute({
  method: 'get',
  path: '/v1/links/settings',
  tags: ['links'],
  summary: 'Public link switches the web handoff pages read',
  responses: {
    200: {
      description: 'Current settings',
      content: { 'application/json': { schema: linkSettingsSchema } },
    },
  },
});

/** Seconds the Worker and CDNs may reuse the settings: a flag flip reaches pages within this. */
export const LINK_SETTINGS_MAX_AGE_S = 60;

export function registerLinkRoutes(app: OpenAPIHono<AppEnv>, deps: LinkRouteDeps): void {
  app.openapi(settingsRoute, async (c) => {
    // `client_config` carries only public flags whose audience is everyone, so a flag scoped to
    // a cohort never switches the clip on for the whole web.
    const { rows } = await deps.pool.query<{ value: unknown }>(
      'SELECT value FROM client_config WHERE key = $1',
      [APP_CLIP_FLAG_KEY],
    );
    c.header('cache-control', `public, max-age=${LINK_SETTINGS_MAX_AGE_S}`);
    return c.json({ app_clip: rows[0]?.value === true }, 200);
  });

  app.openapi(
    previewRoute,
    async (c) => {
      const visitor = visitorOf(c, deps);
      await enforce(deps.redis, `rl:links:preview:ip:${visitor.ip}`, PREVIEW_PER_IP_RULE);
      const { token } = c.req.valid('param');
      const { kind, seat, c: channel } = c.req.valid('query');
      const path = `/${LINK_PATH_PREFIXES[kind]}/${encodeURIComponent(token)}`;
      const target = parseLinkPath(seat === undefined ? path : `${path}/${seat}`);
      if (target === null) throw new DomainError('NOT_FOUND');
      const humanOpen = isHumanLinkOpen({
        method: c.req.method,
        userAgent: visitor.userAgent,
        ip: visitor.ip,
        purpose:
          c.req.header('sec-purpose') ?? c.req.header('purpose') ?? c.req.header('x-purpose'),
      });
      const preview = await previewLink(
        { pool: deps.pool, registry: deps.links, firstOpens: deps.redis },
        { target, humanOpen, channel: channel ?? null },
      );
      void deps.analytics?.serverTrack(
        'link_clicked',
        {
          type: target.kind,
          is_bot: !humanOpen,
          surface: 'web',
          ...(isLinkChannel(channel) ? { channel } : {}),
        },
        { uid: null },
      );
      return c.json(preview, 200);
    },
    validationHook,
  );

  app.openapi(
    codeRoute,
    async (c) => {
      const visitor = visitorOf(c, deps);
      await enforce(deps.redis, `rl:links:code:ip:${visitor.ip}`, CODE_LOOKUP_PER_IP_RULE);
      const device = c.req.header('x-cp-install-id');
      if (device !== undefined) {
        await enforce(
          deps.redis,
          `rl:links:code:device:${hashForLog(device)}`,
          CODE_LOOKUP_PER_DEVICE_RULE,
        );
      }
      const code = normalizeJoinCode(c.req.valid('param').code);
      if (code === null) throw new DomainError('NOT_FOUND');
      const target = { kind: 'invite' as const, code };
      const preview = await previewLink(
        { pool: deps.pool, registry: deps.links, firstOpens: deps.redis },
        { target, humanOpen: false, channel: null },
      );
      if (preview.state !== 'active') throw new DomainError('NOT_FOUND');
      const link = linkPath(preview.kind === 'referral' ? { kind: 'referral', code } : target);
      return c.json({ ...preview, code, link }, 200);
    },
    validationHook,
  );

  app.openapi(
    claimRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const envelope = c.req.valid('json');
      if (envelope.cmd !== CLAIM_ATTRIBUTION) {
        throw new DomainError('VALIDATION', { reason: 'cmd_path_mismatch' });
      }
      await enforce(
        deps.redis,
        `rl:links:claim:device:${hashForLog(envelope.device.id)}`,
        CLAIM_PER_DEVICE_RULE,
      );
      const outcome = await executeCommand(envelope, {
        pool: deps.pool,
        resolve: deps.registry.resolve,
        actor: { kind: 'system', uid: session.uid },
        door: 'system',
      });
      if (outcome.status === 'rejected') throw new DomainError(outcome.code, outcome.detail);
      if (outcome.status === 'duplicate' && outcome.original === 'rejected') {
        throw new DomainError(outcome.code ?? 'INTERNAL', outcome.detail);
      }
      return c.json(outcomeBody(outcome), 200);
    },
    validationHook,
  );
}
