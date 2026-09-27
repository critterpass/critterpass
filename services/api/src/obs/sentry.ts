/**
 * Sentry for the api (`@sentry/node` 10.x, pinned: 11 changes the integration API). Errors only:
 * traces go to OpenTelemetry (./otel.ts), so Sentry skips its own OTel setup and tracing. Every
 * event passes the shared scrubber (`@cp/domain` redact): no bodies, headers, cookies or query
 * strings, the user reduced to an id. `captureInternal` returns the event id the `INTERNAL` wire
 * error carries in `detail.event_id`.
 */
import { sentryScrubbing } from '@cp/domain';
import * as Sentry from '@sentry/node';

export interface SentryOptions {
  readonly dsn: string | undefined;
  readonly environment: string;
  /** `api@<version>+<commit>`. */
  readonly release: string;
  /** Network boundary override (tests). */
  readonly transport?: Sentry.NodeOptions['transport'];
}

export interface ErrorReporter {
  /** Reports an unexpected error; returns the Sentry event id, or undefined when Sentry is off. */
  captureInternal(error: unknown, context: { readonly reqId?: string }): string | undefined;
  flush(timeoutMs?: number): Promise<boolean>;
}

export const NOOP_ERROR_REPORTER: ErrorReporter = {
  captureInternal: () => undefined,
  flush: () => Promise.resolve(true),
};

export function initSentry(options: SentryOptions): ErrorReporter {
  if (!options.dsn) return NOOP_ERROR_REPORTER;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
    includeLocalVariables: false,
    serverName: 'api',
    maxBreadcrumbs: 30,
    ...sentryScrubbing(),
    ...(options.transport ? { transport: options.transport } : {}),
  });
  return {
    captureInternal(error, context) {
      return Sentry.captureException(error, {
        tags: context.reqId ? { req_id: context.reqId } : {},
      });
    },
    flush: (timeoutMs = 2_000) => Sentry.flush(timeoutMs),
  };
}
