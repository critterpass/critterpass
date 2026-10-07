/**
 * Security headers on a deployed site: the local suite proves the build sends them, this proves
 * the site people reach does (a deploy that never ran, or a route in front of the Worker, would
 * pass the local suite and fail here). Runs with the link-preview check after every staging
 * deploy; plain GETs only.
 *
 *   UNFURL_BASE_URL=https://staging.critterpass.app \
 *     pnpm --filter @cp/web exec playwright test -c tests/site/unfurl.config.ts deployed-headers
 */
import { test } from '@playwright/test';

import { expectSecurityHeaders } from './expect-security-headers';

const BASE = process.env['UNFURL_BASE_URL'];

// One address per way a response is produced: prerendered pages and files (served as assets),
// pages the Worker renders, its 404s, app-link pages and files, partner links and share cards.
const RESPONSES = [
  '/',
  '/tips',
  '/favicon.svg',
  '/j',
  '/r',
  '/p/does-not-exist',
  '/locals/does-not-exist',
  '/app/trip/abc/day/2',
  '/out/does-not-exist',
  '/og/invite/NOCODE.png',
  '/.well-known/apple-app-site-association',
  '/no-such-page',
];

test.describe('security headers on the deployed site', () => {
  test.skip(BASE === undefined, 'needs UNFURL_BASE_URL');
  for (const path of RESPONSES) {
    test(`are sent on ${path}`, async ({ request }) => {
      const response = await request.get(new URL(path, BASE).toString(), { maxRedirects: 0 });
      expectSecurityHeaders(response.headers());
    });
  }
});
