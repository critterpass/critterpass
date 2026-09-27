/**
 * Server-side flag evaluation with posthog-node local evaluation: flag definitions are polled with
 * the feature-flags secret key and evaluated in process, so no per-user request goes to PostHog.
 * `GET /v1/config/bootstrap` returns `flags` from `evaluate` so the app renders the right variant
 * on first paint. PostHog down, slow, unconfigured or returning junk → catalog defaults.
 */
import { FLAG_CATALOG, resolveFlags, type FlagCatalog, type FlagValues } from '@cp/domain';
import { PostHog, type PostHogOptions } from 'posthog-node';

export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

export interface FlagServiceOptions<C extends FlagCatalog> {
  readonly projectApiKey: string | undefined;
  /** Feature-flags secure API key (or personal key); required for local evaluation. */
  readonly flagsSecretKey: string | undefined;
  readonly host?: string | undefined;
  readonly catalog?: C;
  /** Upper bound on waiting for the first definitions load per request. */
  readonly readyTimeoutMs?: number;
  readonly onError?: (error: unknown) => void;
  /** Network boundary override (tests). */
  readonly fetch?: PostHogOptions['fetch'];
  readonly pollingIntervalMs?: number;
}

export interface FlagSubject {
  /** The pseudonymous `user_pid`, or the device's anonymous id; never the raw uid. */
  readonly distinctId: string;
  readonly appVersion?: string;
  readonly platform?: 'ios' | 'android' | 'web';
}

export interface FlagService<C extends FlagCatalog> {
  readonly evaluate: (subject: FlagSubject) => Promise<FlagValues<C>>;
  readonly shutdown: () => Promise<void>;
}

export function createFlagService<C extends FlagCatalog = typeof FLAG_CATALOG>(
  options: FlagServiceOptions<C>,
): FlagService<C> {
  const catalog = (options.catalog ?? FLAG_CATALOG) as unknown as C;
  const defaults = () => resolveFlags(undefined, catalog);
  if (!options.projectApiKey || !options.flagsSecretKey) {
    return { evaluate: () => Promise.resolve(defaults()), shutdown: () => Promise.resolve() };
  }
  const client = new PostHog(options.projectApiKey, {
    host: options.host ?? POSTHOG_EU_HOST,
    personalApiKey: options.flagsSecretKey,
    strictLocalEvaluation: true,
    featureFlagsPollingInterval: options.pollingIntervalMs ?? 30_000,
    disableGeoip: true,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (options.onError) client.on('error', options.onError);
  const readyTimeoutMs = options.readyTimeoutMs ?? 500;

  return {
    async evaluate(subject) {
      try {
        const ready = await client.waitForLocalEvaluationReady(readyTimeoutMs);
        if (!ready) return defaults();
        const evaluated = await client.getAllFlags(subject.distinctId, {
          onlyEvaluateLocally: true,
          personProperties: {
            ...(subject.appVersion ? { app_version: subject.appVersion } : {}),
            ...(subject.platform ? { platform: subject.platform } : {}),
          },
        });
        return resolveFlags(evaluated, catalog);
      } catch (error) {
        options.onError?.(error);
        return defaults();
      }
    },
    shutdown: () => client.shutdown(),
  };
}
