/**
 * Serves the recorded Valhalla exchanges (`record.ts`) back to the client at the fetch boundary,
 * matched by path and request body; an unrecorded request fails instead of reaching a network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RecordedValhallaExchange } from './record';

export function loadValhallaScenario(scenario: string): RecordedValhallaExchange[] {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, `${scenario}.json`), 'utf8'),
  ) as RecordedValhallaExchange[];
}

export const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function replayValhalla(scenario: string) {
  const exchanges = loadValhallaScenario(scenario);
  const calls: string[] = [];
  const fetch = (input: string | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(input).pathname;
    calls.push(path);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    const match = exchanges.find(
      (exchange) =>
        exchange.path === path && JSON.stringify(exchange.request) === JSON.stringify(body),
    );
    if (match === undefined) {
      return Promise.reject(new Error(`unrecorded ${path} ${JSON.stringify(body)}`));
    }
    return Promise.resolve(jsonResponse(match.status, match.response));
  };
  return { exchanges, calls, fetch };
}
