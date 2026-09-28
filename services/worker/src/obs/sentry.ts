/**
 * Sentry for the worker (`@sentry/node` 10.x): dead-lettered jobs and process-level crashes.
 * Errors only (traces go to OpenTelemetry). Job payloads never reach Sentry: a dead letter is
 * reported with its queue, job id and attempt count, and the message passes the shared scrubber.
 */
import { sentryScrubbing } from '@cp/domain';
import * as Sentry from '@sentry/node';

import type { DeadLetterAlert, DeadLetterAlertSink } from '../boss';

export interface WorkerSentryOptions {
  readonly dsn: string | undefined;
  readonly environment: string;
  /** `worker@<version>+<commit>`. */
  readonly release: string;
  /** Network boundary override (tests). */
  readonly transport?: Sentry.NodeOptions['transport'];
}

export interface WorkerErrorReporter {
  readonly deadLetter: DeadLetterAlertSink;
  flush(timeoutMs?: number): Promise<boolean>;
}

export function initWorkerSentry(options: WorkerSentryOptions): WorkerErrorReporter {
  if (!options.dsn) return { deadLetter: () => undefined, flush: () => Promise.resolve(true) };
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    serverName: 'worker',
    // Errors only. Leave every trace sample option unset: any of them, even a rate of 0, turns on
    // Sentry's http and pg span integrations, and with the OTel setup skipped those record through
    // our tracer provider, so each request gets a second server span and pg spans double up.
    // OpenTelemetry already registered the import hook (./instrument.ts); a second one only warns.
    skipOpenTelemetrySetup: true,
    registerEsmLoaderHooks: false,
    includeLocalVariables: false,
    ...sentryScrubbing(),
    ...(options.transport ? { transport: options.transport } : {}),
  });
  return {
    deadLetter(alert: DeadLetterAlert) {
      const error = new Error(`job dead-lettered on ${alert.queue}: ${alert.message}`);
      error.name = 'DeadLetter';
      Sentry.captureException(error, {
        tags: { queue: alert.queue },
        extra: { job_id: alert.jobId, attempts: alert.attempts },
        fingerprint: ['dead-letter', alert.queue],
      });
    },
    flush: (timeoutMs = 2_000) => Sentry.flush(timeoutMs),
  };
}
