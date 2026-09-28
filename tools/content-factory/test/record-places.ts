// Records the places test's decision and model fixtures against a scratch database:
// `CP_ENV_FILE=… DATABASE_URL=… CONTENT_FACTORY_RECORD=test/fixtures/record tsx test/record-places.ts`.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway, loadGatewayEnv } from '@cp/ai';

import { openPool } from '../src/db';
import '../src/kinds/places/pois';
import { runPipeline } from '../src/pipeline';
import { recordingFetch } from '../src/record';
import { seedFixturePois } from './places-fixture';

process.loadEnvFile(process.env['CP_ENV_FILE'] ?? '.env');
const pool = openPool();
if (pool === null) throw new Error('set DATABASE_URL');
await seedFixturePois(pool);
await pool.end();
const record = process.env['CONTENT_FACTORY_RECORD'] ?? '';
await runPipeline({
  kind: 'places',
  batchKey: 'record',
  stages: ['brief', 'generate'],
  pool: null,
  gateway: createGateway({ ...loadGatewayEnv(), fetch: recordingFetch(record) }),
  root: mkdtempSync(path.join(os.tmpdir(), 'factory-record-')),
  options: { destinations: 'bali' },
  log: console.log,
});
