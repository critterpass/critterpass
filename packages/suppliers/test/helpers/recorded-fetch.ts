/**
 * Serves recorded supplier responses at the network boundary: each route matches a request URL by
 * path and query parameters and answers with a file recorded from the real supplier. Every request
 * is kept so tests can assert what was sent (headers, URL) without a live call.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface RecordedRoute {
  readonly path: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly file: string;
  readonly status?: number;
}

export interface RecordedRequest {
  readonly url: URL;
  readonly headers: Headers;
}

export function recordedFetch(fixtureDir: string, routes: readonly RecordedRoute[]) {
  const requests: RecordedRequest[] = [];
  const fetch = (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    requests.push({ url, headers: new Headers(init?.headers) });
    const route = routes.find(
      (candidate) =>
        candidate.path === url.pathname &&
        Object.entries(candidate.params ?? {}).every(
          ([key, value]) => url.searchParams.get(key) === value,
        ),
    );
    if (route === undefined) {
      return Promise.reject(new Error(`no recorded response for ${url.pathname}`));
    }
    const body = readFileSync(path.join(fixtureDir, route.file), 'utf8');
    return Promise.resolve(
      new Response(body, {
        status: route.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { fetch, requests };
}
