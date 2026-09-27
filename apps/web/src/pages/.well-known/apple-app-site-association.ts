/* eslint-disable lingui/no-unlocalized-strings -- HTTP header values, not UI copy. */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { appleAppSiteAssociation } from '../../lib/links/association';
import { fetchLinkSwitches } from '../../lib/links/link-settings';
import { linkRequestContext, type LinksWebEnv } from '../../lib/links/web-env';

// Served per host as JSON with no redirect (Apple's CDN refuses redirects and needs JSON). The
// App Clip entry follows the `links.app_clip` flag and is left out whenever the api cannot say.
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const context = linkRequestContext(url, env as unknown as LinksWebEnv);
  const switches = await fetchLinkSwitches({ apiBaseUrl: context.apiBaseUrl });
  const body = appleAppSiteAssociation(url.hostname.toLowerCase(), { appClip: switches.appClip });
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
};
