/**
 * Sentry for the ops console (`@sentry/browser`): errors only, no replay, no tracing, and every
 * event through the shared scrubber (the console shows user records, so request bodies, headers
 * and query strings never leave). Off when `VITE_SENTRY_DSN` is unset (local builds).
 */
import { sentryScrubbing } from '@cp/domain';
import * as Sentry from '@sentry/browser';

export interface AdminSentryOptions {
  readonly dsn: string | undefined;
  readonly environment: string;
  readonly release?: string | undefined;
  /** Network boundary override (tests). */
  readonly transport?: Sentry.BrowserOptions['transport'];
}

export function initAdminSentry(options: AdminSentryOptions): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    ...sentryScrubbing(),
    ...(options.transport ? { transport: options.transport } : {}),
  });
  return true;
}

export { captureException } from '@sentry/browser';
