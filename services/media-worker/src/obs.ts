/**
 * Sentry for the media Worker (`@sentry/cloudflare`): errors only, scrubbed by the shared
 * redactor, and never the signed query string (signatures, key ids and expiries are stripped
 * from every URL). Without `SENTRY_DSN` the SDK stays disabled.
 */
import { sentryScrubbing } from '@cp/domain';
import * as Sentry from '@sentry/cloudflare';

export interface ObservabilityEnv {
  readonly SENTRY_DSN?: string;
  /** `staging` | `production`; set per Wrangler environment. */
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
}

export function sentryOptions(env: ObservabilityEnv): Sentry.CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN ?? '',
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.SENTRY_ENVIRONMENT ?? 'local',
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    tracesSampleRate: 0,
    ...sentryScrubbing(),
  };
}

/** Instruments the handler in place; its own type (and callable `fetch`) is kept for callers. */
export function withObservability<H extends object>(handler: H): H {
  const instrumented = Sentry.withSentry<ObservabilityEnv>((env) => sentryOptions(env), handler);
  return instrumented as H;
}
