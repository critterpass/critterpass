/**
 * Re-records the Mapbox routing fixtures from the live API (a dozen requests, free tier):
 *   pnpm --filter @cp/api exec tsx --env-file=../../.env test/routing/record-fixtures.ts
 * Reads MAPBOX_TOKEN (or MAPBOX_SECRET_TOKEN); the token never reaches the saved fixtures.
 */
import { MapboxRoutingClient } from '../../src/routing/mapbox';
import { createMapboxRoutingProvider } from '../../src/routing/eta';
import type { RoutingProvider } from '../../src/routing/provider';

import { recordingClient, saveExchanges } from './http-fixtures';
import { ETA_SCENARIOS, LEAVE_BY_SCENARIOS, MATRIX_SCENARIOS, RECORDED_NOW } from './scenarios';

const accessToken = process.env['MAPBOX_TOKEN'] ?? process.env['MAPBOX_SECRET_TOKEN'];
if (accessToken === undefined || accessToken === '') {
  throw new Error('MAPBOX_TOKEN or MAPBOX_SECRET_TOKEN must be set');
}

async function record(scenario: string, run: (provider: RoutingProvider) => Promise<unknown>) {
  const http = recordingClient();
  const provider = createMapboxRoutingProvider({
    client: new MapboxRoutingClient({ accessToken: accessToken!, http, timeoutMs: 15_000 }),
    now: () => RECORDED_NOW,
    onProviderError: (error) => {
      throw error;
    },
  });
  await run(provider);
  saveExchanges(scenario, http.exchanges);
  console.log(`${scenario}: ${http.exchanges.length} request(s)`);
}

for (const [scenario, input] of Object.entries(ETA_SCENARIOS)) {
  await record(scenario, (provider) => provider.eta(input));
}
for (const [scenario, input] of Object.entries(MATRIX_SCENARIOS)) {
  await record(scenario, (provider) => provider.matrix(input));
}
for (const [scenario, input] of Object.entries(LEAVE_BY_SCENARIOS)) {
  await record(scenario, (provider) => provider.leaveBy(input));
}
