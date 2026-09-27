import { Hono } from 'hono';

import type { MembershipStore } from './membership';

export interface SubscribeProxyRequest {
  client: string;
  user: string;
  channel: string;
}

export type SubscribeDecision = { allow: true } | { allow: false; code: number; message: string };

/**
 * The ACL a real `POST /internal/rt/subscribe` runs (api-contracts-async.md §1.2): only crew
 * members may subscribe to `crew:{crew_id}`; every other namespace is denied by default,
 * matching the "default: disallow" posture the rest of this stack uses.
 */
export function decideSubscribe(
  request: SubscribeProxyRequest,
  membership: MembershipStore,
): SubscribeDecision {
  if (!request.channel.startsWith('crew:')) {
    return { allow: false, code: 403, message: 'unknown namespace' };
  }
  if (!membership.isMember(request.channel, request.user)) {
    return { allow: false, code: 403, message: 'not a crew member' };
  }
  return { allow: true };
}

/**
 * Centrifugo's subscribe-proxy contract: `{result: {}}` to allow, `{error: {code, message}}` to
 * deny. Presence ("can a member call sub.presence()") is a separate grant — the response's
 * `allow: ["prs"]` capability is Centrifugo PRO only; the OSS equivalent is the namespace's
 * `allow_presence_for_subscriber` (config.json), which this proxy's membership check already
 * makes safe to leave on for the whole `crew` namespace.
 */
export function createSubscribeProxyApp(membership: MembershipStore) {
  const app = new Hono();
  app.post('/internal/rt/subscribe', async (c) => {
    const body = await c.req.json<SubscribeProxyRequest>();
    const decision = decideSubscribe(body, membership);
    if (decision.allow) return c.json({ result: {} });
    return c.json({ error: { code: decision.code, message: decision.message } });
  });
  return app;
}
