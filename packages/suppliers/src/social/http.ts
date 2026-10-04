/**
 * The network boundary of the social readers: one injected `fetch` (recorded fixtures in tests)
 * and a per-request timeout, so a slow platform never holds an import open.
 */
export type SocialFetch = (input: string, init?: RequestInit) => Promise<Response>;

export const SOCIAL_TIMEOUT_MS = 6_000;

export class SocialReadError extends Error {
  constructor(
    readonly reason: 'not_found' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'SocialReadError';
  }
}

/** GETs JSON; a 4xx is `not_found` (private, deleted or not a post), anything else `unavailable`. */
export async function getJson(
  fetch: SocialFetch,
  url: string,
  timeoutMs = SOCIAL_TIMEOUT_MS,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SocialReadError('unavailable', `request failed: ${String(error)}`);
  }
  if (response.status >= 400 && response.status < 500) {
    throw new SocialReadError('not_found', `status ${response.status}`);
  }
  if (!response.ok) throw new SocialReadError('unavailable', `status ${response.status}`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new SocialReadError('unavailable', 'not JSON');
  }
}
