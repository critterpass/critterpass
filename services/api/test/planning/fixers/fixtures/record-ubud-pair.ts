/**
 * Records what the router answers for the one pair the road-timed fixer tests create (Pura Taman
 * Saraswati to the Tegallalang terraces, walk and drive), through the same batching the api uses,
 * against a live Valhalla (by default the FOSSGIS public instance, same shapes as our service):
 *
 *   pnpm --filter @cp/api exec tsx test/planning/fixers/fixtures/record-ubud-pair.ts [base url]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPlanningTravel, createValhallaClient } from '@cp/suppliers';

import { planningFitTravel } from '../../../../src/routing/travel-modes';

export const SARASWATI = { lat: -8.5064, lng: 115.2617 };
export const TEGALLALANG = { lat: -8.4338, lng: 115.2789 };

export interface RecordedExchange {
  readonly path: string;
  readonly request: unknown;
  readonly status: number;
  readonly response: unknown;
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] ?? 'https://valhalla1.openstreetmap.de';
  const exchanges: RecordedExchange[] = [];
  const recording: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    exchanges.push({
      path: new URL(input instanceof Request ? input.url : input).pathname,
      request: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      status: response.status,
      response: (await response.clone().json()) as unknown,
    });
    return response;
  };
  const travel = planningFitTravel(
    createPlanningTravel({ valhalla: createValhallaClient({ baseUrl, fetch: recording }) }),
  );
  const legs = await travel(1, 1200).legs([
    { from: { key: 'saraswati', ...SARASWATI }, to: { key: 'tegallalang', ...TEGALLALANG } },
  ]);
  exchanges.sort((a, b) => JSON.stringify(a.request).localeCompare(JSON.stringify(b.request)));
  writeFileSync(
    join(import.meta.dirname, 'ubud-pair.json'),
    `${JSON.stringify(exchanges, null, 2)}\n`,
  );
  console.log([...legs.entries()]);
}

if (process.argv[1]?.endsWith('record-ubud-pair.ts') === true) await main();
