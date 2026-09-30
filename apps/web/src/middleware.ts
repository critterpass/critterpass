/* eslint-disable lingui/no-unlocalized-strings -- hostname/URL plumbing, not JSX/UI copy. */
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

import { forwardSupplierRedirect, supplierSubId } from './lib/links/supplier-redirect';
import { linkRequestContext, type LinksWebEnv } from './lib/links/web-env';

/**
 * `www.critterpass.app` -> the apex, preserving path/query (founder decision: go live on the apex).
 * Partner links on the `go.` host go through the api's attribution bridge; one the bridge cannot
 * redirect falls through to the not-found page.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  if (url.hostname === 'www.critterpass.app') {
    const target = new URL(url);
    target.hostname = 'critterpass.app';
    return context.redirect(target.toString(), 301);
  }
  if (url.pathname.startsWith('/out/')) {
    const linkContext = linkRequestContext(url, env as unknown as LinksWebEnv);
    const subId = supplierSubId(url.pathname, linkContext);
    if (subId !== null) {
      const redirect = await forwardSupplierRedirect({ apiBaseUrl: linkContext.apiBaseUrl, subId });
      if (redirect !== null) return redirect;
    }
  }
  return next();
});
