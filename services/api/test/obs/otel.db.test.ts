/**
 * Registers the ESM hook and starts OpenTelemetry before pg, node:http or the app load (dynamic
 * imports below), exactly as the production preload does; vitest runs each file in its own fork.
 */
import { createRequire, register } from 'node:module';
import { connect } from 'node:net';

import { SpanKind } from '@opentelemetry/api';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type Pg from 'pg';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startOtel, type Otel } from '../../src/obs/otel';

const exporter = new InMemorySpanExporter();
let otel: Otel | undefined;
let stop: () => Promise<void> = () => Promise.resolve();
let baseUrl = '';

beforeAll(async () => {
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
  register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);
  otel = startOtel({
    serviceName: 'api',
    serviceVersion: '0.0.0',
    environment: 'test',
    commit: 'test',
    spanExporter: exporter,
  });
  await waitForAllMessagesAcknowledged();

  // Loaded through require so the require hook sees it (vitest imports externals by file path).
  const pg = createRequire(import.meta.url)('pg') as typeof Pg;
  const { serve } = await import('@hono/node-server');
  const { pino } = await import('pino');
  const { startPostgres } = await import('@cp/db/testing');
  const { createApp } = await import('../../src/app');

  const postgres = await startPostgres();
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 2 });
  const app = createApp({
    service: 'api',
    version: '0.0.0',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    exposeDocs: false,
    readiness: {
      db: async () => {
        await pool.query('select 1');
      },
    },
  });
  const server = serve({ fetch: app.fetch, port: 0 });
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await postgres.stop();
  };
}, 240_000);

afterAll(async () => {
  await stop();
  await otel?.shutdown();
});

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

function rawGet(path: string, traceparent: string): Promise<number> {
  const { port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), '127.0.0.1', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: localhost\r\ntraceparent: ${traceparent}\r\nConnection: close\r\n\r\n`,
      );
    });
    let head = '';
    socket.on('data', (chunk: Buffer) => {
      head += chunk.toString('latin1');
    });
    socket.on('end', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/u.exec(head)?.[1] ?? 0)));
    socket.on('error', reject);
  });
}

describe('opentelemetry', { timeout: 60_000 }, () => {
  it('traces /ready from the caller traceparent through the api into Postgres', async () => {
    // A raw socket, like the app: an instrumented client would replace the traceparent.
    const status = await rawGet('/ready?token=secret-value', `00-${TRACE_ID}-00f067aa0ba902b7-01`);
    expect(status).toBe(200);

    let spans: ReadableSpan[] = [];
    for (let attempt = 0; attempt < 50; attempt += 1) {
      spans = exporter.getFinishedSpans().filter((span) => span.spanContext().traceId === TRACE_ID);
      if (
        spans.some((span) => span.kind === SpanKind.SERVER) &&
        spans.some((span) => span.name.startsWith('pg'))
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const server = spans.find((span) => span.kind === SpanKind.SERVER);
    const query = spans.find(
      (span) => span.attributes['db.system'] === 'postgresql' || span.name.startsWith('pg'),
    );
    expect(server?.parentSpanContext?.spanId).toBe('00f067aa0ba902b7');
    expect(query).toBeDefined();
    expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain('secret-value');
  });
});
