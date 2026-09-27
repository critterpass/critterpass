/** Extracts the session cookie from a Better Auth response's `set-cookie` header, if any. */
export function extractSessionCookie(response: Response): string | undefined {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return undefined;
  return /better-auth\.session_token=[^;]+/.exec(setCookie)?.[0];
}

export interface CallResult {
  response: Response;
  cookie: string | undefined;
  json: unknown;
}

/**
 * Drives a running harness the way a real client would: over HTTP, threading the session
 * cookie returned by one call into the next. Endpoints are relative to the harness's
 * `/api/auth` mount (e.g. `/sign-in/anonymous`, `/jwks`).
 */
export async function call(
  baseUrl: string,
  path: string,
  options: { method?: string | undefined; body?: unknown; cookie?: string | undefined } = {},
): Promise<CallResult> {
  const method = options.method ?? 'POST';
  const headers = new Headers();
  if (options.cookie) headers.set('cookie', options.cookie);
  // Better Auth's body parser rejects an empty string as invalid JSON, so a bodyless POST
  // (e.g. `/sign-in/anonymous`, which takes no fields) still needs an explicit `{}`.
  const body = method === 'GET' ? undefined : JSON.stringify(options.body ?? {});
  if (body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  const cookie = extractSessionCookie(response) ?? options.cookie;
  const text = await response.text();
  return { response, cookie, json: text.length > 0 ? (JSON.parse(text) as unknown) : undefined };
}
