/**
 * The one HTTP seam of the sync client: JSON POSTs to the api with the Better Auth session attached
 * (docs/api-contracts.md §2.2 "session bearer"). A thrown error always means the request never got
 * a response (offline, DNS, timeout); any response, including a 5xx, resolves.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */

export interface TransportResponse {
  readonly status: number;
  /** Parsed JSON body, or null when the response had none. */
  readonly body: unknown;
}

export interface SyncTransport {
  postJson(path: string, body: unknown): Promise<TransportResponse>;
}

export interface FetchTransportOptions {
  readonly baseUrl: string;
  /** Session headers per request, e.g. `{cookie}` from the Better Auth Expo client's `getCookie()`. */
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createFetchTransport(options: FetchTransportOptions): SyncTransport {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async postJson(path, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(`${options.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await options.sessionHeaders()),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        return { status: response.status, body: await readJson(response) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface WireError {
  readonly code: string;
  readonly detail?: unknown;
}

/** The `{error: {code, detail?}}` envelope of a non-2xx api response, when it has one. */
export function wireError(body: unknown): WireError | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const { error } = body;
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code, detail } = error as { code: unknown; detail?: unknown };
  return typeof code === 'string' ? { code, detail } : null;
}
