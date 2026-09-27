/**
 * Replays Anthropic Messages API fixtures (test/fixtures/anthropic/*.json) at the network boundary:
 * the real SDK client runs end to end, only `fetch` is swapped. Responses are served in the order
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

export function loadFixture(name: string): { readonly response: FixtureResponse } {
  const url = new URL(`./fixtures/anthropic/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as { response: FixtureResponse };
}

export interface FixtureTransport {
  readonly fetch: typeof fetch;
  readonly requests: Record<string, unknown>[];
}

export function fixtureTransport(names: readonly string[]): FixtureTransport {
  const queue = [...names];
  const requests: Record<string, unknown>[] = [];
  const replay = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    const name = queue.shift();
    if (name === undefined) throw new Error('fixture transport: no response left to replay');
    requests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const { response } = loadFixture(name);
    const headers = new Headers({ 'request-id': `req_fixture_${name}`, ...response.headers });
    if (response.sse !== undefined) {
      headers.set('content-type', 'text/event-stream');
      const text = response.sse
        .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
        .join('');
      return new Response(text, { status: response.status, headers });
    }
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(response.body), { status: response.status, headers });
  };
  return { fetch: replay as typeof fetch, requests };
}
