import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { comingSoonSitemapPaths, isComingSoonPath } from './coming-soon-surface';
import { SITE_LOCALE_CODES } from './locale';

const allowed = (path: string): boolean => isComingSoonPath(path, SITE_LOCALE_CODES);

describe('coming-soon surface', () => {
  it.each([
    '/',
    '/vi',
    '/zh-Hans',
    '/zh-hans',
    '/id',
    '/privacy',
    '/w/somefriend',
    '/api/waitlist/join',
    '/api/waitlist/stats',
    '/api/waitlist/handle/somefriend',
    '/robots.txt',
    '/sitemap-index.xml',
    '/sitemap-0.xml',
  ])('serves %s', (path) => {
    expect(allowed(path)).toBe(true);
  });

  it.each([
    '/tips',
    '/tips/pack-light',
    '/legal',
    '/legal/privacy',
    '/r',
    '/r/WYNST8',
    '/j',
    '/i',
    '/i/x',
    '/p/x',
    '/g/x',
    '/out/x',
    '/app',
    '/app/open',
    '/plan',
    '/locals',
    '/og/home.png',
    '/og/invite/SANDY4.png',
    '/rss.xml',
    '/de',
    '/en-XA',
    '/nope',
    '/w',
    '/w/a/b',
    '/vi/tips',
    '/api',
    '/api/other',
    '/privacy/more',
  ])('answers 404 for %s', (path) => {
    expect(allowed(path)).toBe(false);
  });

  it('gates every page folder the full site has', () => {
    // A new top-level route is closed in coming-soon mode until it is added here on purpose.
    const open = new Set(['index', 'privacy', '[locale]', '404', 'api', 'w', 'robots.txt']);
    const routes = readdirSync(new URL('../pages', import.meta.url))
      .map((entry) => entry.replace(/\.(astro|ts)$/u, ''))
      .filter((entry) => !open.has(entry));
    expect(routes.length).toBeGreaterThan(8);
    for (const route of routes) {
      expect(allowed(`/${route}`), `/${route}`).toBe(false);
      expect(allowed(`/${route}/x`), `/${route}/x`).toBe(false);
    }
  });

  it('lists only its own addresses in the sitemap', () => {
    const paths = comingSoonSitemapPaths(SITE_LOCALE_CODES);
    expect(paths).toHaveLength(SITE_LOCALE_CODES.length + 2);
    for (const path of paths) expect(allowed(path), path).toBe(true);
  });
});
