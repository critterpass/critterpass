/**
 * Preloaded with `node --import` ahead of the api entry: registers the ESM import hook so the
 * http, undici, pg and pino instrumentations can patch those modules as the entry loads them,
 * then starts OpenTelemetry. Reads only the few variables it needs; the entry validates the rest.
 */
import { register } from 'node:module';

import { createAddHookMessageChannel } from 'import-in-the-middle';

import packageJson from '../../package.json' with { type: 'json' };

import { startOtel } from './otel';

const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
if (endpoint) {
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
  register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);
  const otel = startOtel({
    serviceName: 'api',
    serviceVersion: packageJson.version,
    environment: process.env['APP_ENV'] ?? 'local',
    commit: process.env['COMMIT_SHA'] ?? 'dev',
    endpoint,
  });
  await waitForAllMessagesAcknowledged();
  const stop = () => void otel?.shutdown();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
