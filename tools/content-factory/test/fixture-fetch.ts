/**
 * Replays recorded API responses (test/fixtures/<name>.json, written by `CONTENT_FACTORY_RECORD`)
 * in place of `fetch`: the real gateway and search clients run end to end, only the network is
 * swapped. Every request is counted so tests can assert that a cached run makes no calls.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ReplayFetch {
  readonly fetch: typeof fetch;
  readonly requests: unknown[];
}

export function loadRecording(name: string): { response: { status: number; body: unknown } } {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as {
    response: { status: number; body: unknown };
  };
}

export function replayFetch(names: readonly string[]): ReplayFetch {
  const queue = [...names];
  const requests: unknown[] = [];
  const replay = (_input: unknown, init?: RequestInit): Promise<Response> => {
    const name = queue.shift();
    if (name === undefined) throw new Error('replay fetch: no recorded response left');
    requests.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
    const { response } = loadRecording(name);
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'content-type': 'application/json', 'request-id': `req_${name}` },
      }),
    );
  };
  return { fetch: replay, requests };
}
