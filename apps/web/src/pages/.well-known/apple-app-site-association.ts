/* eslint-disable lingui/no-unlocalized-strings -- HTTP header values, not UI copy. */
import type { APIRoute } from 'astro';

import { appleAppSiteAssociation } from '../../lib/links/association';

// Served per host as JSON with no redirect (Apple's CDN refuses redirects and needs JSON).
export const prerender = false;

export const GET: APIRoute = ({ url }) =>
  new Response(JSON.stringify(appleAppSiteAssociation(url.hostname.toLowerCase())), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
