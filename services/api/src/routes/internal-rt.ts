/**
 * Centrifugo subscribe and publish proxies (docs/api-contracts.md §5.7, auth class J): called only
 * by Centrifugo over the private network, authenticated with a shared header Centrifugo sends as a
 * static proxy header. Proxy protocol: HTTP 200 with `{result: {...}}` to allow or
 * `{error: {code, message}}` to refuse; any other status is an internal error Centrifugo retries on
 * the client's behalf, which is what a database or Redis outage should look like.
 */
import { timingSafeEqual } from 'node:crypto';

import type { Hono } from 'hono';
import type pg from 'pg';
import { z } from 'zod';

import { authorizeChannel } from '../realtime/acl';
import { getNamespace } from '../realtime/namespaces';
import {
  buildClientPublication,
  checkClientPublish,
  takePublishSlot,
  type RtRateStore,
} from '../realtime/publish-rules';

export const RT_PROXY_SECRET_HEADER = 'x-cp-rt-proxy-secret';

export interface InternalRtDeps {
  readonly pool: pg.Pool;
  readonly redis: RtRateStore;
  /** Shared with Centrifugo's `channel.proxy.*.http.static_headers`; never logged. */
  readonly proxySecret: string;
}

const subscribeRequestSchema = z.object({
  user: z.string(),
  channel: z.string().min(1).max(255),
});

const publishRequestSchema = z.object({
  user: z.string(),
  channel: z.string().min(1).max(255),
  data: z.unknown(),
});

/** Proxy refusal codes the realtime client maps to its own states (docs/api-contracts.md §5.7). */
const REFUSAL = {
  forbidden: { error: { code: 403, message: 'permission denied' } },
  tooLarge: { error: { code: 413, message: 'publication too large' } },
  rateLimited: { error: { code: 429, message: 'too many requests' } },
} as const;

function secretMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function registerInternalRtRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  deps: InternalRtDeps,
): void {
  app.use('/internal/rt/*', async (c, next) => {
    if (!secretMatches(deps.proxySecret, c.req.header(RT_PROXY_SECRET_HEADER))) {
      return c.json(
        {
          error: { code: 'AUTH_REQUIRED', message: 'invalid proxy credentials', retryable: false },
        },
        401,
      );
    }
    await next();
  });

  app.post('/internal/rt/subscribe', async (c) => {
    const body = subscribeRequestSchema.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json(REFUSAL.forbidden);
    const decision = await authorizeChannel(deps.pool, body.data.user, body.data.channel, {
      withPresenceInfo: true,
    });
    if (!decision.allowed) return c.json(REFUSAL.forbidden);
    return c.json({ result: decision.info !== undefined ? { info: decision.info } : {} });
  });

  app.post('/internal/rt/publish', async (c) => {
    const body = publishRequestSchema.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json(REFUSAL.forbidden);
    const { user, channel, data } = body.data;

    // Cheapest checks first: the channel's namespace rules, then the Redis window, then the ACL.
    const namespaceName = channel.slice(0, Math.max(channel.indexOf(':'), 0));
    const check = checkClientPublish(getNamespace(namespaceName)?.clientPublish, data);
    if (!check.ok) {
      return c.json(check.reason === 'too_large' ? REFUSAL.tooLarge : REFUSAL.forbidden);
    }

    const claimed = await takePublishSlot(deps.redis, {
      uid: user,
      channel,
      type: check.type,
      minIntervalMs: check.minIntervalMs,
    });
    if (!claimed) return c.json(REFUSAL.rateLimited);

    const decision = await authorizeChannel(deps.pool, user, channel);
    if (!decision.allowed) return c.json(REFUSAL.forbidden);

    return c.json({
      result: { data: buildClientPublication(user, check), skip_history: true },
    });
  });
}
