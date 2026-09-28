/**
 * Replays the JSON fixtures in ./fixtures at the network boundary (the vendor and model clients run
 * end to end, only `fetch` is swapped) and keeps each request for assertions.
 */
import { readFileSync } from 'node:fs';

interface Fixture {
  readonly response: { readonly status: number; readonly body: unknown };
}

export interface Replay {
  readonly fetch: typeof fetch;
  readonly requests: { url: string; body: Record<string, unknown>; headers: Headers }[];
}

export function replay(...names: string[]): Replay {
  const queue = [...names];
  const requests: Replay['requests'] = [];
  const doFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const name = queue.shift();
    if (name === undefined) throw new Error('replay: no fixture left');
    const url = input instanceof Request ? input.url : input.toString();
    const body = typeof init?.body === 'string' ? init.body : '{}';
    requests.push({
      url,
      body: JSON.parse(body) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    const fixture = JSON.parse(
      readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
    ) as Fixture;
    return Promise.resolve(
      new Response(JSON.stringify(fixture.response.body), {
        status: fixture.response.status,
        headers: { 'content-type': 'application/json', 'request-id': `req_${name}` },
      }),
    );
  };
  return { fetch: doFetch, requests };
}
