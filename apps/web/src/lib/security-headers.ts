/* eslint-disable lingui/no-unlocalized-strings -- HTTP header values, not UI copy. */
/**
 * Security headers of every response the site sends. Pages rendered by the Worker get them from
 * the middleware; prerendered pages and files are served without running the Worker and get the
 * same set from `public/_headers` (a test keeps the two in step).
 *
 * The content policy fits what pages load: scripts, styles, fonts and images from this origin
 * only, analytics beacons to PostHog EU and error reports to Sentry. Astro inlines small scripts
 * and stylesheets and components set `style` attributes, so inline script and style stay allowed;
 * no other origin may supply code, nothing may frame a page, and forms post to this origin only.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://eu.i.posthog.com https://*.sentry.io",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

/** Sets the headers on a response, copying it first when its headers cannot be changed. */
export function withSecurityHeaders(response: Response): Response {
  let target = response;
  try {
    target.headers.set('X-Content-Type-Options', 'nosniff');
  } catch {
    target = new Response(response.body, response);
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) target.headers.set(name, value);
  return target;
}
