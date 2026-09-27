/**
 * Network-boundary doubles for the Mapbox routing client: a recorder that saves real responses
 * (access token stripped) and a replayer that serves them back by request path + query.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RoutingHttpClient } from '../../src/routing/mapbox';

export const FIXTURE_DIR = join(import.meta.dirname, 'fixtures');

export interface RecordedExchange {
  readonly request: string;
  readonly status: number;
  readonly body: unknown;
}

/** Path + query without the access token: the fixture key, safe to commit. */
export function requestKey(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('access_token');
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

export function loadExchanges(scenario: string): RecordedExchange[] {
  return JSON.parse(
    readFileSync(join(FIXTURE_DIR, `${scenario}.json`), 'utf8'),
  ) as RecordedExchange[];
}

/** Serves recorded exchanges; an unrecorded request fails the test instead of reaching the network. */
export function replayClient(exchanges: readonly RecordedExchange[]): RoutingHttpClient & {
  readonly calls: string[];
} {
  const byKey = new Map(exchanges.map((exchange) => [exchange.request, exchange]));
  const calls: string[] = [];
  return {
    calls,
    fetch: (input) => {
      const key = requestKey(input);
      calls.push(key);
      const exchange = byKey.get(key);
      if (exchange === undefined) return Promise.reject(new Error(`unrecorded request ${key}`));
      return Promise.resolve(
        new Response(JSON.stringify(exchange.body), {
          status: exchange.status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

/** Never answers until the caller's abort signal fires, like a hung upstream. */
export const hangingClient: RoutingHttpClient = {
  fetch: (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
    }),
};

/** Wraps real `fetch`, keeping every exchange for `saveExchanges`. */
export function recordingClient(): RoutingHttpClient & { readonly exchanges: RecordedExchange[] } {
  const exchanges: RecordedExchange[] = [];
  return {
    exchanges,
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const body: unknown = await response.json();
      exchanges.push({ request: requestKey(input), status: response.status, body });
      return new Response(JSON.stringify(body), { status: response.status });
    },
  };
}

export function saveExchanges(scenario: string, exchanges: readonly RecordedExchange[]): void {
  writeFileSync(join(FIXTURE_DIR, `${scenario}.json`), `${JSON.stringify(exchanges, null, 2)}\n`);
}
