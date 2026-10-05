/**
 * Traces from the built bundle, started exactly as the Dockerfile starts it (`node --import
 * <instrument.js> <index.js>`) with Sentry on: the spans reach an in-process OTLP/HTTP receiver,
 * and each request must yield one server span from the http instrumentation with its pg spans
 * nested under it. Source-level suites miss what only the bundle and the Sentry init show.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { runMigrations } from '@cp/db';
import { startPostgres } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface ExportedSpan {
  readonly scope: string;
  readonly name: string;
  readonly kind: number;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string;
  readonly attributes: string;
}

interface OtlpTraces {
  resourceSpans?: {
    scopeSpans?: {
      scope?: { name?: string };
      spans?: {
        name: string;
        kind: number;
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        attributes?: unknown[];
      }[];
    }[];
  }[];
}

const SERVER = 2;
const packageDir = fileURLToPath(new URL('../..', import.meta.url));
// Inside the package's node_modules so the bundle resolves its npm dependencies like dist does.
const outDir = 'node_modules/.cache/bundle-traces';

const spans: ExportedSpan[] = [];
const traceContentTypes = new Set<string>();
let receiver: Server | undefined;
let api: ChildProcess | undefined;
let stopPostgres: () => Promise<unknown> = () => Promise.resolve();
let baseUrl = '';

function startReceiver(): Promise<number> {
  receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (request.url === '/v1/traces') {
        traceContentTypes.add(request.headers['content-type'] ?? '');
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as OtlpTraces;
        for (const resource of body.resourceSpans ?? [])
          for (const scope of resource.scopeSpans ?? [])
            for (const span of scope.spans ?? [])
              spans.push({
                scope: scope.scope?.name ?? '',
                name: span.name,
                kind: span.kind,
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId ?? '',
                attributes: JSON.stringify(span.attributes ?? []),
              });
      }
      // OTLP and Sentry envelopes alike get an empty success.
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  receiver.listen(0, '127.0.0.1');
  return once(receiver, 'listening').then(() => (receiver?.address() as AddressInfo).port);
}

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitFor<T>(
  read: () => T | undefined | Promise<T | undefined>,
  what: string,
  ms = 90_000,
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

beforeAll(async () => {
  execFileSync('pnpm', ['exec', 'tsdown', '--out-dir', outDir, '--log-level', 'error'], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  const [receiverPort, apiPort, postgres] = await Promise.all([
    startReceiver(),
    freePort(),
    startPostgres(),
  ]);
  stopPostgres = () => postgres.stop();
  const databaseUrl = postgres.getConnectionUri();
  // Migrated, as every deployment's database is: the api's job producer needs the pg-boss schema,
  // and /health answers ready only once that producer has started.
  const migrator = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await runMigrations(migrator);
  await migrator.end();
  baseUrl = `http://127.0.0.1:${apiPort}`;
  api = spawn(
    process.execPath,
    ['--enable-source-maps', '--import', `./${outDir}/obs/instrument.js`, `${outDir}/index.js`],
    {
      cwd: packageDir,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        PATH: process.env['PATH'],
        NODE_ENV: 'production',
        APP_ENV: 'local',
        PORT: String(apiPort),
        LOG_LEVEL: 'error',
        DATABASE_URL: databaseUrl,
        AUTH_DATABASE_URL: databaseUrl,
        // Nothing listens here: readiness reports Redis down, the database probe still runs.
        REDIS_URL: 'redis://127.0.0.1:9',
        PUBLIC_BASE_URL: baseUrl,
        BETTER_AUTH_SECRET: 'bundle-traces-test-secret-0123456789abcdef',
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${receiverPort}`,
        OTEL_BSP_SCHEDULE_DELAY: '100',
        SENTRY_DSN: `http://public@127.0.0.1:${receiverPort}/1`,
      },
    },
  );
  const started = api;
  await waitFor(async () => {
    if (started.exitCode !== null) throw new Error(`api exited with ${started.exitCode}`);
    const up = await fetch(`${baseUrl}/health`).then(
      (response) => response.ok,
      () => false,
    );
    return up ? true : undefined;
  }, 'the api to answer /health');
}, 240_000);

afterAll(async () => {
  if (api && api.exitCode === null) {
    api.kill('SIGTERM');
    await once(api, 'exit');
  }
  receiver?.close();
  await stopPostgres();
});

const traceparent = (traceId: string) => `00-${traceId}-00f067aa0ba902b7-01`;

describe('built api bundle traces', { timeout: 120_000 }, () => {
  it('nests pg spans under one http server span and skips probe paths', async () => {
    const healthTrace = '11111111111111111111111111111111';
    const readyTrace = '22222222222222222222222222222222';
    for (const [path, traceId] of [
      ['/health', healthTrace],
      ['/favicon.ico', healthTrace],
      ['/ready?token=secret-value', readyTrace],
    ] as const) {
      await fetch(`${baseUrl}${path}`, { headers: { traceparent: traceparent(traceId) } });
    }

    const inTrace = (traceId: string) => spans.filter((span) => span.traceId === traceId);
    const query = await waitFor(
      () => inTrace(readyTrace).find((span) => span.name.startsWith('pg.query')),
      'a pg query span',
    );
    const ready = inTrace(readyTrace);
    const servers = ready.filter((span) => span.kind === SERVER);
    expect(servers.map((span) => span.scope)).toEqual(['@opentelemetry/instrumentation-http']);
    const server = servers[0];
    expect(server?.parentSpanId).toBe('00f067aa0ba902b7');

    // Walk up from the query: it must reach the server span.
    const byId = new Map(ready.map((span) => [span.spanId, span]));
    let cursor: ExportedSpan | undefined = query;
    while (cursor && cursor.spanId !== server?.spanId) cursor = byId.get(cursor.parentSpanId);
    expect(cursor).toBe(server);

    expect(query.scope).toBe('@opentelemetry/instrumentation-pg');
    expect(inTrace(healthTrace)).toEqual([]);
    expect(spans.filter((span) => span.scope.startsWith('@sentry/'))).toEqual([]);
    expect(ready.map((span) => span.attributes).join()).not.toContain('secret-value');
    expect([...traceContentTypes]).toEqual(['application/json']);
  });
});
