import { expect, test } from '@playwright/test';

import { LIVE_TOKEN } from '../driver-plan/fake-driver-plans';
import { COMING_SOON_URL } from './playwright.config';

// One address per way a response is produced: prerendered pages and files (served as assets),
// pages and endpoints the Worker renders, its refusals, and the coming-soon front door.
const RESPONSES = [
  '/',
  '/tips',
  '/legal/privacy',
  '/favicon.svg',
  '/fonts/Geist-400.woff2',
  '/i/SANDY4',
  '/app/trip/abc/day/2',
  '/og/invite/VANE55.png',
  '/.well-known/apple-app-site-association',
  '/no-such-page',
  `${COMING_SOON_URL}/`,
  `${COMING_SOON_URL}/tips`,
  `${COMING_SOON_URL}/api/waitlist/stats`,
];

// Every kind of page a visitor can open, with the scripts, styles, fonts and images it loads.
const PAGES = [
  '/',
  '/vi',
  '/tips',
  '/tips/how-to-get-six-friends-to-agree',
  '/legal',
  '/legal/privacy',
  '/privacy',
  '/i/SANDY4',
  '/i/BAX6XA',
  '/j',
  '/j/bax-6xa',
  '/r',
  '/r/WYNST8',
  '/w/somefriend',
  '/p/KyotoSlowly4Days0Token01',
  '/plan/not-a-trip-id',
  '/app/trip/abc/day/2',
  '/d/made-invite01',
  `/t/${LIVE_TOKEN}`,
  `/t/${LIVE_TOKEN}/quote`,
  '/no-such-page',
  `${COMING_SOON_URL}/`,
  `${COMING_SOON_URL}/no-such-page`,
];

test.describe('security headers', () => {
  for (const path of RESPONSES) {
    test(`are sent on ${path}`, async ({ request }) => {
      const headers = (await request.get(path, { maxRedirects: 0 })).headers();
      const maxAge = /max-age=(\d+)/u.exec(headers['strict-transport-security'] ?? '');
      expect(Number(maxAge?.[1])).toBeGreaterThanOrEqual(15_552_000);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['permissions-policy']).toContain('geolocation=()');
      const policy = headers['content-security-policy'] ?? '';
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toContain("'unsafe-eval'");
    });
  }

  for (const path of PAGES) {
    test(`the content policy blocks nothing ${path} loads`, async ({ page }) => {
      const blocked: string[] = [];
      await page.exposeFunction('reportBlocked', (line: string) => blocked.push(line));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (globalThis as unknown as { reportBlocked: (line: string) => void })
            .reportBlocked;
          report(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.headers()['content-security-policy']).toBeTruthy();
      expect(blocked).toEqual([]);
    });
  }
});
