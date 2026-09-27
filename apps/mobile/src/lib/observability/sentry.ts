/**
 * Sentry for the app (`@sentry/react-native` with its Expo plugin): crashes and errors with
 * release health (crash-free sessions gate EAS Update staged rollouts). Privacy: the shared
 * scrubber on every event and breadcrumb, `sendDefaultPii: false`, no screenshots, no view
 * hierarchy, no session replay (map and chat must never be captured), no tracing. Source maps
 * and dSYM/ProGuard mappings upload from EAS builds; `dist` is the EAS update id when one is
 * running, so symbolication matches the bundle actually executing.
 */
import { sentryScrubbing } from '@cp/domain';
import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

/** The DSN (a public client key), inlined by Metro from `EXPO_PUBLIC_SENTRY_DSN`. */
export function sentryDsnFromEnv(): string | undefined {
  const dsn = process.env['EXPO_PUBLIC_SENTRY_DSN'];
  return dsn === undefined || dsn === '' ? undefined : dsn;
}

export interface AppRelease {
  readonly release: string;
  readonly dist: string;
}

/** `critterpass@1.2.0` + dist = the running EAS update id, else the native build number. */
export function appRelease(
  version: string | null = Application.nativeApplicationVersion,
  build: string | null = Application.nativeBuildVersion,
  updateId: string | null = Updates.updateId,
): AppRelease {
  return {
    release: `critterpass@${version ?? '0.0.0'}`,
    dist: updateId ?? build ?? 'dev',
  };
}

export interface AppSentryOptions {
  readonly dsn: string | undefined;
  /** `development` | `staging` | `production` (the app.config variant). */
  readonly environment: string;
}

export function sentryOptions(options: AppSentryOptions): Sentry.ReactNativeOptions {
  return {
    dsn: options.dsn ?? '',
    enabled: options.dsn !== undefined,
    environment: options.environment,
    ...appRelease(),
    enableAutoSessionTracking: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 50,
    ...sentryScrubbing(),
  };
}

export function initAppSentry(options: AppSentryOptions): void {
  Sentry.init(sentryOptions(options));
}

/** Release builds report a dropped analytics event as a breadcrumb, never the event's props. */
export function analyticsViolationBreadcrumb(violation: {
  readonly event: string;
  readonly reason: string;
  readonly detail: string;
}): void {
  Sentry.addBreadcrumb({
    category: 'analytics',
    level: 'warning',
    message: `dropped ${violation.event}: ${violation.reason}`,
    data: { key: violation.detail },
  });
}

export { wrap as wrapRootComponent } from '@sentry/react-native';
