/**
 * Replays recorded API fixtures at the network boundary: DeepSeek responses in the Anthropic
 * Messages format (test/fixtures/deepseek, the default), Tavily search responses
 * (test/fixtures/tavily), TypeSafe Jev responses (test/fixtures/typesafe) or protocol-level status
 * responses (test/fixtures/anthropic). A name may carry its directory (`anthropic/overloaded-529`).
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
}

export const FIXTURE_DIRS = ['deepseek', 'tavily', 'typesafe', 'anthropic'] as const;
export type FixtureDir = (typeof FIXTURE_DIRS)[number];

function locate(name: string, dir: FixtureDir): string {
  const slash = name.indexOf('/');
  const prefix = name.slice(0, slash);
  return slash !== -1 && (FIXTURE_DIRS as readonly string[]).includes(prefix)
    ? name
    : `${dir}/${name}`;
}

export function loadFixture(
  name: string,
  dir: FixtureDir = 'deepseek',
): { readonly response: FixtureResponse } {
  const url = new URL(`./fixtures/${locate(name, dir)}.json`, import.meta.url);
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
    headers.set('content-type', 'application/json');
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status, headers }),
    );
  };
  return { fetch: replay, requests, urls, methods };
}
