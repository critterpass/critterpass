/* eslint-disable lingui/no-unlocalized-strings -- header names, URL paths and error codes, not UI copy. */
/**
 * Server-side calls from the driver plan pages to the api's no-login routes. They pass the
 * visitor's IP and user agent with the shared proxy secret, so the api rate-limits and bot-filters
 * the visitor rather than this Worker. Nothing here is cached: a revoked link switches off on the
 * next request.
 */
import { env } from 'cloudflare:workers';
import {
  driverPlanOffDetailSchema,
  driverPlanPageSchema,
  type DriverPlanOffDetail,
  type DriverPlanPage,
  type DriverPlanReplyPayload,
} from '@cp/domain';

import { linkRequestContext, type LinksWebEnv } from '../../lib/links/web-env';

export type DriverPlanLoad =
  | { readonly status: 'ok'; readonly page: DriverPlanPage }
  | { readonly status: 'off'; readonly detail: DriverPlanOffDetail; readonly revoked: boolean }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable' };

export type DriverReplyResult =
  | { readonly status: 'sent'; readonly replaced: boolean }
  | { readonly status: 'off'; readonly detail: DriverPlanOffDetail; readonly revoked: boolean }
  | { readonly status: 'invalid' }
  | { readonly status: 'voting' }
  | { readonly status: 'rate_limited' }
  | { readonly status: 'unavailable' };

interface ErrorBody {
  readonly error?: { readonly code?: string; readonly detail?: unknown };
}

function request(req: Request, url: URL, token: string, suffix = '', init: RequestInit = {}) {
  const webEnv = env as unknown as LinksWebEnv;
  const { apiBaseUrl } = linkRequestContext(url, webEnv);
  const headers = new Headers({ accept: 'application/json' });
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const secret = webEnv.LINKS_WEB_PROXY_SECRET;
  if (secret !== undefined && secret !== '') {
    headers.set('x-cp-web-proxy', secret);
    const ip = req.headers.get('cf-connecting-ip');
    const ua = req.headers.get('user-agent');
    if (ip !== null) headers.set('x-cp-visitor-ip', ip);
    if (ua !== null) headers.set('x-cp-visitor-ua', ua);
  }
  return fetch(`${apiBaseUrl}/v1/public/driver-plans/${encodeURIComponent(token)}${suffix}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(5000),
  });
}

async function offDetail(
  response: Response,
): Promise<{ detail: DriverPlanOffDetail; revoked: boolean } | null> {
  if (response.status !== 410) return null;
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const parsed = driverPlanOffDetailSchema.safeParse(body?.error?.detail);
  if (!parsed.success) return null;
  return { detail: parsed.data, revoked: body?.error?.code === 'SHARE_REVOKED' };
}

export async function loadDriverPlan(
  req: Request,
  url: URL,
  token: string,
): Promise<DriverPlanLoad> {
  try {
    const response = await request(req, url, token);
    if (response.status === 404) return { status: 'not_found' };
    const off = await offDetail(response);
    if (off !== null) return { status: 'off', ...off };
    if (!response.ok) return { status: 'unavailable' };
    const parsed = driverPlanPageSchema.safeParse(await response.json());
    return parsed.success ? { status: 'ok', page: parsed.data } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function sendDriverReply(
  req: Request,
  url: URL,
  token: string,
  reply: DriverPlanReplyPayload,
): Promise<DriverReplyResult> {
  try {
    const response = await request(req, url, token, '/reply', {
      method: 'POST',
      body: JSON.stringify(reply),
    });
    if (response.ok) {
      const body = (await response.json()) as { replaced?: boolean };
      return { status: 'sent', replaced: body.replaced === true };
    }
    const off = await offDetail(response);
    if (off !== null) return { status: 'off', ...off };
    if (response.status === 429) return { status: 'rate_limited' };
    if (response.status === 422) return { status: 'invalid' };
    if (response.status === 409) return { status: 'voting' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
