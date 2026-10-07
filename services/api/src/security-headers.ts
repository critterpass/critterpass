import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

/** One year: browsers that reach the api (link pages, the docs page) stay on HTTPS. */
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

const BASE = {
  strictTransportSecurity: STRICT_TRANSPORT_SECURITY,
  xContentTypeOptions: true,
  xFrameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
  // The app and the site's Worker read these responses, never another site's page: the
  // cross-origin isolation headers would add nothing and could hide media from a browser client.
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  xDnsPrefetchControl: false,
  xDownloadOptions: false,
  xPermittedCrossDomainPolicies: false,
  xXssProtection: false,
} as const;

/**
 * Security headers on every response. The api serves JSON, so its content policy allows nothing
 * to load and nothing to frame it; the API reference page (served only where docs are exposed)
 * loads its own script and styles and is left without a content policy.
 */
export function securityHeaders(options: { docsPath: string }): MiddlewareHandler {
  const json = secureHeaders({
    ...BASE,
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  });
  const docs = secureHeaders(BASE);
  return (c, next) => (c.req.path === options.docsPath ? docs(c, next) : json(c, next));
}
