/* eslint-disable lingui/no-unlocalized-strings -- hostname/URL plumbing, not JSX/UI copy. */
import { defineMiddleware } from 'astro:middleware';

/** `www.critterpass.app` -> the apex, preserving path/query (founder decision: go live on the apex). */
export const onRequest = defineMiddleware((context, next) => {
  const { url } = context;
  if (url.hostname === 'www.critterpass.app') {
    const target = new URL(url);
    target.hostname = 'critterpass.app';
    return context.redirect(target.toString(), 301);
  }
  return next();
});
