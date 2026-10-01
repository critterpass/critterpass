/* eslint-disable lingui/no-unlocalized-strings -- hostname/URL plumbing, not JSX/UI copy. */
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

import { siteMode } from './components/site/site-mode';
import { isComingSoonPath } from './lib/coming-soon-surface';
import { SITE_LOCALE_CODES } from './lib/locale';

export const onRequest = defineMiddleware((context, next) => {
  const { url } = context;
  // `www.critterpass.app` -> the apex, preserving path/query (founder decision: go live on the apex).
  if (url.hostname === 'www.critterpass.app') {
    const target = new URL(url);
    target.hostname = 'critterpass.app';
    return context.redirect(target.toString(), 301);
  }
  // Until launch the Worker serves the coming-soon surface only: every other page of the full
  // site is not found. (Prerendered pages are left out of a coming-soon build; this covers the
  // server-rendered ones. Pages being prerendered at build time are not requests.)
  if (
    !context.isPrerendered &&
    // The 404 page being rendered for a refused address is not itself refused.
    context.routePattern !== '/404' &&
    siteMode((env as unknown as { SITE_MODE?: string }).SITE_MODE) === 'coming-soon' &&
    !isComingSoonPath(url.pathname, SITE_LOCALE_CODES)
  ) {
    return new Response(null, { status: 404 });
  }
  return next();
});
