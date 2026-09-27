/**
 * The admin Worker (`admin.critterpass.app`, config in infra/cloudflare/admin/wrangler.toml): serves
 * the SPA from static assets and reverse-proxies `/v1/admin/*` same-origin to the api, so the
 * host-only `SameSite=Strict` console cookie reaches it. Cloudflare Access sits in front of the host;
 * the Access assertion it injects is the only `Cf-Access-*` header forwarded. Every response carries
 * the console's security headers.
 */

export interface AdminWorkerEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  /** The api origin, e.g. `https://api.critterpass.app`. */
  readonly API_ORIGIN: string;
}

const API_PREFIX = '/v1/admin/';
const ACCESS_ASSERTION = 'cf-access-jwt-assertion';
const CLIENT_IP = 'x-cp-client-ip';
const OSM_TILES = 'https://tile.openstreetmap.org';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: blob: ${OSM_TILES}`,
  `connect-src 'self' ${OSM_TILES}`,
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}

function stripAccessHeaders(headers: Headers, keepAssertion: boolean): void {
  for (const name of [...headers.keys()]) {
    if (name.startsWith('cf-access-') && !(keepAssertion && name === ACCESS_ASSERTION)) {
      headers.delete(name);
    }
  }
}

async function proxyToApi(
  request: Request,
  env: AdminWorkerEnv,
  fetchApi: typeof fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  stripAccessHeaders(headers, true);
  headers.delete(CLIENT_IP);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp !== null) headers.set(CLIENT_IP, clientIp);
  headers.delete('host');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetchApi(new URL(`${url.pathname}${url.search}`, env.API_ORIGIN), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : null,
    redirect: 'manual',
  });
}

export async function handleAdminRequest(
  request: Request,
  env: AdminWorkerEnv,
  fetchApi: typeof fetch = fetch,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith(API_PREFIX)) {
    return withSecurityHeaders(await proxyToApi(request, env, fetchApi));
  }
  const headers = new Headers(request.headers);
  stripAccessHeaders(headers, false);
  return withSecurityHeaders(await env.ASSETS.fetch(new Request(request, { headers })));
}

// eslint-disable-next-line no-restricted-syntax -- the Worker entry: Workers load the module's default export.
export default {
  fetch: (request: Request, env: AdminWorkerEnv) => handleAdminRequest(request, env),
};
