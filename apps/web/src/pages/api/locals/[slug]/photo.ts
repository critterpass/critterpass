/* eslint-disable lingui/no-unlocalized-strings -- HTTP header values, not JSX/UI copy. */
/**
 * `/api/locals/{slug}/photo`: the photo of a place's public locals page, served from this site so
 * the page loads nothing from another origin. The address of the stored file comes from the api's
 * public locals projection only; a place without a photo, or an unknown place, answers 404.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { fetchPublicLocals } from '../../../../lib/api/public-previews';
import { linkRequestContext, type LinksWebEnv } from '../../../../lib/links/web-env';

export const prerender = false;

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ params, request, url }) => {
  const webEnv = env as unknown as LinksWebEnv;
  const outcome = await fetchPublicLocals({
    apiBaseUrl: linkRequestContext(url, webEnv).apiBaseUrl,
    target: { kind: 'locals', slug: params['slug'] ?? '' },
    visitorIp: request.headers.get('cf-connecting-ip'),
    visitorUserAgent: request.headers.get('user-agent'),
    proxySecret: webEnv.LINKS_WEB_PROXY_SECRET,
  });
  if (outcome.status !== 'found' || outcome.locals.photo === null) return notFound();
  try {
    const stored = await fetch(outcome.locals.photo.url, { signal: AbortSignal.timeout(8000) });
    const type = stored.headers.get('content-type') ?? '';
    if (!stored.ok || !type.startsWith('image/')) return notFound();
    return new Response(stored.body, {
      headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' },
    });
  } catch {
    return notFound();
  }
};
