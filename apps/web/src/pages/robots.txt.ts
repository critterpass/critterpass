/* eslint-disable lingui/no-unlocalized-strings -- robots directives, not UI copy. */
import type { APIRoute } from 'astro';

/** Crawlers may read everything the site serves; the sitemap says what that is. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap-index.xml', site ?? 'https://critterpass.app');
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap.toString()}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
