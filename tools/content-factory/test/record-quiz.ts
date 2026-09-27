// Records the pipeline test's model fixture: `CP_ENV_FILE=… tsx test/record-quiz.ts`.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway, loadGatewayEnv } from '@cp/ai';

import { registerKind } from '../src/kinds/registry';
import { runPipeline } from '../src/pipeline';
import { recordingFetch } from '../src/record';
import { quizKind } from './quiz-kind';

process.loadEnvFile(process.env['CP_ENV_FILE'] ?? '.env');
registerKind(quizKind());
const root = mkdtempSync(path.join(os.tmpdir(), 'factory-record-'));
const gateway = createGateway({
  ...loadGatewayEnv(),
  fetch: recordingFetch(path.join(import.meta.dirname, 'fixtures', 'record')),
});
await runPipeline({
  kind: 'taste_quiz',
  batchKey: 'record',
  stages: ['brief', 'generate'],
  pool: null,
  gateway,
  root,
  log: console.log,
});
