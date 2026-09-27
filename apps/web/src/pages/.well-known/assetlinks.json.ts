/* eslint-disable lingui/no-unlocalized-strings -- HTTP header values, not UI copy. */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { assetLinks, parseCertFingerprints } from '../../lib/links/association';
import type { LinksWebEnv } from '../../lib/links/web-env';

// Served per host as JSON with no redirect, which Android's App Link verifier requires.
export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const fingerprints = parseCertFingerprints(
    (env as unknown as LinksWebEnv).ANDROID_CERT_FINGERPRINTS,
  );
  return new Response(JSON.stringify(assetLinks(url.hostname.toLowerCase(), fingerprints)), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
};
