// Records the POI selection test's model fixture against a scratch database:
// `CP_ENV_FILE=… DATABASE_URL=… CONTENT_FACTORY_RECORD=test/fixtures/record tsx test/record-places-select.ts`.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway, loadGatewayEnv } from '@cp/ai';

import { openPool } from '../src/db';
import { selectCurated } from '../src/kinds/places/select';
import { recordingFetch } from '../src/record';
import { seedSelectFixture } from './places-select-fixture';

process.loadEnvFile(process.env['CP_ENV_FILE'] ?? '.env');
const pool = openPool();
if (pool === null) throw new Error('set DATABASE_URL');
const destinationId = await seedSelectFixture(pool);
const ids = await selectCurated(pool, { id: destinationId, slug: 'kyoto' }, 6, {
  gateway: createGateway({
    ...loadGatewayEnv(),
    fetch: recordingFetch(process.env['CONTENT_FACTORY_RECORD'] ?? ''),
  }),
  maxCostMicros: 200_000,
  cacheDir: mkdtempSync(path.join(os.tmpdir(), 'factory-select-record-')),
  log: console.log,
});
console.log(ids.length, 'selected');
await pool.end();
