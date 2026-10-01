/* eslint-disable lingui/no-unlocalized-strings -- route paths, not UI copy. */
/**
 * What the site serves while it is the coming-soon page (`SITE_MODE=coming-soon`, production until
 * launch): the front door in every language, its privacy page, the referral door and the waitlist
 * endpoints. Everything else the full site has (tips, legal documents, invite and link pages, share
 * cards, the feed) answers 404 until launch. One allow-list, used by the Worker for every request
 * it handles and by the build to leave the other prerendered pages out (astro.config.mjs).
 * No imports, so the build config can load it.
 */

/** Addresses that are files rather than pages: always part of the surface. */
const FILES = new Set(['/robots.txt', '/sitemap-index.xml', '/sitemap-0.xml']);

/**
 * Whether `pathname` belongs to the coming-soon surface. `localeCodes` are the languages the page
 * is offered in; their addresses match in any letter case (`/zh-hans` redirects to `/zh-Hans`).
 */
export function isComingSoonPath(pathname: string, localeCodes: readonly string[]): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  if (path === '/' || path === '/privacy' || FILES.has(path)) return true;
  if (path.startsWith('/api/waitlist/')) return true;
  const segments = path.slice(1).split('/');
  const [first = '', second = ''] = segments;
  if (segments.length === 1) {
    return localeCodes.some((code) => code.toLowerCase() === first.toLowerCase());
  }
  // A referral link: `/w/<handle>`.
  return segments.length === 2 && first === 'w' && second !== '';
}

/** The sitemap of a coming-soon build: the front door, each language's address, the privacy page. */
export function comingSoonSitemapPaths(localeCodes: readonly string[]): string[] {
  return ['/', ...localeCodes.map((code) => `/${code}`), '/privacy'];
}
