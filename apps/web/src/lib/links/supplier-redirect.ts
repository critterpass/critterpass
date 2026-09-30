/* eslint-disable lingui/no-unlocalized-strings -- header names and URL paths, not UI copy. */
/**
 * Partner links leave the app as `go.<domain>/out/{sub_id}`. On the `go.` host a path whose segment
 * has the sub id shape is handed to the api's attribution bridge (`GET /v1/suppliers/r/{sub_id}`),
 * and its redirect to the partner goes back to the visitor untouched and uncached. `/out/` is not an
 * app link path, so the tap never reopens the app. Anything the bridge cannot redirect falls through
 * to the site's not-found page.
 */
import { SUB_ID_PATTERN } from '@cp/domain';

import type { LinkRequestContext } from './web-env';

const SUPPLIER_PATH = /^\/out\/([^/]+)\/?$/u;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** The sub id a request asks the bridge for, or null when the request is not a partner link. */
export function supplierSubId(pathname: string, context: LinkRequestContext): string | null {
  if (context.host !== context.config.altHost) return null;
  const subId = SUPPLIER_PATH.exec(pathname)?.[1];
  return subId !== undefined && SUB_ID_PATTERN.test(subId) ? subId : null;
}

export interface SupplierRedirectRequest {
  readonly apiBaseUrl: string;
  readonly subId: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * Asks the bridge for the partner link. Returns the 302 to hand the visitor, or null when the
 * bridge has no redirect for this sub id (unknown, not synced yet, or the api is unreachable).
 */
export async function forwardSupplierRedirect(
  request: SupplierRedirectRequest,
): Promise<Response | null> {
  const url = `${request.apiBaseUrl}/v1/suppliers/r/${encodeURIComponent(request.subId)}`;
  try {
    const response = await (request.fetchImpl ?? fetch)(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(request.timeoutMs ?? 5000),
    });
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || location === null) return null;
    return new Response(null, {
      status: 302,
      headers: {
        location,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch {
    return null;
  }
}
