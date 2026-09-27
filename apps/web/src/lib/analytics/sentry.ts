/* eslint-disable lingui/no-unlocalized-strings -- not JSX; URL patterns only. */
/**
 * Browser error reporting for critterpass.app with no up-front cost: two listeners wait for an
 * uncaught error or rejection and only then load `@sentry/browser`, so pages that never fail
 * ship none of it (the invite landing's JS budget). The SDK is cookieless, without replay or
 * tracing, and scrubbed by the shared redactor; invite codes and seat tokens in the URL path are
 * cut to their route prefix, query strings dropped.
 */
import { sentryScrubbing, type ScrubbableEvent } from '@cp/domain';
import type * as SentryBrowser from '@sentry/browser';

export interface WebSentryOptions {
  readonly dsn: string | undefined;
  readonly environment: string;
  readonly release?: string | undefined;
}

/** `/i/AB12CD/seat` → `/i/:code`: link paths carry codes that must not reach error reports. */
export function redactWebPath(pathname: string): string {
  const match = /^\/(i|j|r|p|plan|g|w|locals)\/[^/]+/u.exec(pathname);
  return match ? `/${match[1] ?? ''}/:code` : pathname;
}

export function redactWebUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${redactWebPath(parsed.pathname)}`;
  } catch {
    return redactWebPath(url.split(/[?#]/u)[0] ?? '');
  }
}

/** The shared scrubber plus link-code redaction on the page URL. */
export function scrubWebEvent<E extends ScrubbableEvent>(event: E): E {
  const scrubbed = sentryScrubbing().beforeSend(event);
  if (scrubbed.request?.url !== undefined) {
    scrubbed.request = { ...scrubbed.request, url: redactWebUrl(scrubbed.request.url) };
  }
  return scrubbed;
}

export function installLazyErrorReporting(
  options: WebSentryOptions,
  target: Window = window,
): void {
  if (!options.dsn) return;
  const dsn = options.dsn;
  let loading: Promise<typeof SentryBrowser> | undefined;
  const report = (error: unknown) => {
    loading ??= import('@sentry/browser').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: options.environment,
        ...(options.release ? { release: options.release } : {}),
        tracesSampleRate: 0,
        ...sentryScrubbing(),
        beforeSend: (event) => scrubWebEvent(event),
      });
      return Sentry;
    });
    void loading.then((Sentry) => Sentry.captureException(error));
  };
  target.addEventListener('error', (event) => report(event.error ?? event.message));
  target.addEventListener('unhandledrejection', (event) => report(event.reason));
}
