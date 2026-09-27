/**
 * Replays recorded API fixtures at the network boundary: Anthropic Messages API responses
 * (test/fixtures/anthropic/*.json, the default) or TypeSafe Jev responses (test/fixtures/typesafe).
 * The real clients run end to end, only `fetch` is swapped. Responses are served in the order
 * given; every request body is kept for assertions.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface FixtureResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly sse?: readonly { readonly event: string; readonly data: unknown }[];
  /** A `.jsonl` body (Message Batches results), one JSON value per line. */
  readonly jsonl?: readonly unknown[];
}

export type FixtureDir = 'anthropic' | 'typesafe';

export function loadFixture(
  name: string,
  dir: FixtureDir = 'anthropic',
): { readonly response: FixtureResponse } {
  const url = new URL(`./fixtures/${dir}/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as { response: FixtureResponse };
}

export interface FixtureTransport {
  readonly fetch: typeof fetch;
  readonly requests: Record<string, unknown>[];
  readonly urls: string[];
  readonly methods: string[];
}

export function fixtureTransport(
  names: readonly string[],
  options: { readonly dir?: FixtureDir } = {},
): FixtureTransport {
  const queue = [...names];
  const requests: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const methods: string[] = [];
  const replay = (input: unknown, init?: RequestInit): Promise<Response> => {
    urls.push(input instanceof Request ? input.url : String(input));
    methods.push(init?.method ?? 'GET');
    const name = queue.shift();
    if (name === undefined) throw new Error('fixture transport: no response left to replay');
    const body = typeof init?.body === 'string' && init.body !== '' ? init.body : '{}';
    requests.push(JSON.parse(body) as Record<string, unknown>);
    const { response } = loadFixture(name, options.dir);
    const headers = new Headers({ 'request-id': `req_fixture_${name}`, ...response.headers });
    if (response.sse !== undefined) {
      headers.set('content-type', 'text/event-stream');
      const text = response.sse
        .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
        .join('');
      return Promise.resolve(new Response(text, { status: response.status, headers }));
    }
    if (response.jsonl !== undefined) {
      headers.set('content-type', 'application/binary');
      const text = response.jsonl.map((line) => JSON.stringify(line)).join('\n');
      return Promise.resolve(new Response(`${text}\n`, { status: response.status, headers }));
    }
    headers.set('content-type', 'application/json');
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status, headers }),
    );
  };
  return { fetch: replay, requests, urls, methods };
}
