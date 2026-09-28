/**
 * Registers the ESM hook and starts OpenTelemetry before pg or the job runtime load (dynamic
 * imports below), as the production preload does; vitest runs each file in its own fork.
 */
import { createRequire, register } from 'node:module';

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type Pg from 'pg';
import type { JobWithMetadata, PgBoss } from 'pg-boss';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { JobFailureReport, WorkerDeps } from '../../src/boss/define-job';
import { startOtel, type Otel } from '../../src/obs/otel';

const exporter = new InMemorySpanExporter();
let otel: Otel | undefined;
let pool: Pg.Pool;
let stop: () => Promise<void> = () => Promise.resolve();
let runJob: (data: unknown, retryCount?: number) => Promise<string>;

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

beforeAll(async () => {
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
  register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);
  otel = startOtel({
    serviceName: 'worker',
    serviceVersion: '0.0.0',
    environment: 'test',
    commit: 'test',
    spanExporter: exporter,
  });
  await waitForAllMessagesAcknowledged();

  // Loaded through require so the require hook sees it (vitest imports externals by file path).
  const pg = createRequire(import.meta.url)('pg') as typeof Pg;
  const { startPostgres } = await import('@cp/db/testing');
  const { defineJob, runAttempt } = await import('../../src/boss/define-job');

  const postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 2 });
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const deps: WorkerDeps = { pool, boss: {} as PgBoss, logger: silent };
  const report: JobFailureReport = () => undefined;
  const def = defineJob({
    queue: 'push.send',
    schema: z.object({ fail: z.boolean() }),
    handler: async ({ fail }, ctx) => {
      await ctx.pool.query('select 1');
      if (fail) throw new Error('handler failed');
    },
  });
  runJob = async (data, retryCount = 0) => {
    const job = {
      id: '0d4f5b8e-8a8f-4a57-9a53-1c8f0f6f9d11',
      data,
      retryCount,
      retryLimit: 5,
      signal: new AbortController().signal,
      output: null,
    } as unknown as JobWithMetadata<unknown>;
    return (await runAttempt(def, job, deps, report)).status;
  };
  stop = async () => {
    await pool.end();
    await postgres.stop();
  };
}, 240_000);

afterAll(async () => {
  await stop();
  await otel?.shutdown();
});

function traceOf(span: ReadableSpan): ReadableSpan[] {
  const traceId = span.spanContext().traceId;
  return exporter.getFinishedSpans().filter((other) => other.spanContext().traceId === traceId);
}

describe('job spans', { timeout: 60_000 }, () => {
  it('nests the handler pg queries under a consumer span named after the queue', async () => {
    exporter.reset();
    expect(await runJob({ fail: false }, 2)).toBe('completed');

    const job = exporter.getFinishedSpans().find((span) => span.kind === SpanKind.CONSUMER);
    expect(job?.name).toBe('push.send');
    expect(job?.parentSpanContext).toBeUndefined();
    expect(job?.attributes).toEqual({
      'messaging.destination.name': 'push.send',
      'job.attempt': 3,
    });
    expect(job?.status.code).not.toBe(SpanStatusCode.ERROR);

    const query = traceOf(job!).find((span) => span.name.startsWith('pg.query'));
    expect(query?.parentSpanContext?.spanId).toBe(job?.spanContext().spanId);
  });

  it('marks a failed attempt with an error status', async () => {
    exporter.reset();
    expect(await runJob({ fail: true })).toBe('failed');
    const job = exporter.getFinishedSpans().find((span) => span.kind === SpanKind.CONSUMER);
    expect(job?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('continues the enqueuing trace a payload carries', async () => {
    exporter.reset();
    const traceparent = `00-${TRACE_ID}-00f067aa0ba902b7-01`;
    expect(await runJob({ fail: false, _trace: { traceparent } })).toBe('completed');
    const job = exporter.getFinishedSpans().find((span) => span.kind === SpanKind.CONSUMER);
    expect(job?.spanContext().traceId).toBe(TRACE_ID);
    expect(job?.parentSpanContext?.spanId).toBe('00f067aa0ba902b7');
    expect(traceOf(job!).some((span) => span.name.startsWith('pg.query'))).toBe(true);
  });
});
