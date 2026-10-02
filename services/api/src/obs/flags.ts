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

export interface EvaluateOptions {
  /** This call's bound on the first definitions load, in place of the service's own. */
  readonly readyTimeoutMs?: number;
}

/** `evaluated` from PostHog's definitions; `defaults` when PostHog is unset, down or not loaded. */
export type FlagSource = 'evaluated' | 'defaults';

export interface FlagAnswer<C extends FlagCatalog> {
  readonly flags: FlagValues<C>;
  readonly source: FlagSource;
}

export interface FlagService<C extends FlagCatalog> {
  readonly evaluate: (subject: FlagSubject, options?: EvaluateOptions) => Promise<FlagValues<C>>;
  /** `evaluate`, saying whether the values were evaluated or are the catalog defaults. */
  readonly answer: (subject: FlagSubject, options?: EvaluateOptions) => Promise<FlagAnswer<C>>;
  readonly shutdown: () => Promise<void>;
}

export function createFlagService<C extends FlagCatalog = typeof FLAG_CATALOG>(
  options: FlagServiceOptions<C>,
): FlagService<C> {
  const catalog = (options.catalog ?? FLAG_CATALOG) as unknown as C;
  const defaults = (): FlagAnswer<C> => ({
    flags: resolveFlags(undefined, catalog),
    source: 'defaults',
  });
  if (!options.projectApiKey || !options.flagsSecretKey) {
    return {
      evaluate: () => Promise.resolve(defaults().flags),
      answer: () => Promise.resolve(defaults()),
      shutdown: () => Promise.resolve(),
    };
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

  const answer: FlagService<C>['answer'] = async (subject, call) => {
    try {
      const ready = await client.waitForLocalEvaluationReady(
        call?.readyTimeoutMs ?? readyTimeoutMs,
      );
      if (!ready) return defaults();
      const evaluated = await client.getAllFlags(subject.distinctId, {
        onlyEvaluateLocally: true,
        personProperties: {
          ...(subject.appVersion ? { app_version: subject.appVersion } : {}),
          ...(subject.platform ? { platform: subject.platform } : {}),
        },
      });
      return { flags: resolveFlags(evaluated, catalog), source: 'evaluated' };
    } catch (error) {
      options.onError?.(error);
      return defaults();
    }
  };

  return {
    answer,
    evaluate: (subject, call) => answer(subject, call).then((answered) => answered.flags),
    shutdown: () => client.shutdown(),
  };
}

/**
 * How long a request waits for a fresh process's first definitions load, so the moments after a
 * deploy are not a kill switch.
 */
export const FIRST_LOAD_WAIT_MS = 3_000;

let processService: FlagService<typeof FLAG_CATALOG> | undefined;

/**
 * The process's one flag service: a single definitions poller, created on first use from the
 * PostHog variables and shared by every caller after that (the bootstrap route and the server's
 * own flag gates). It waits `FIRST_LOAD_WAIT_MS` for the first load.
 */
export function processFlagService(
  env: Readonly<Record<string, string | undefined>>,
): FlagService<typeof FLAG_CATALOG> {
  processService ??= createFlagService({
    projectApiKey: env['POSTHOG_PROJECT_API_KEY'],
    flagsSecretKey: env['POSTHOG_PROJECT_SECRET_KEY'],
    host: env['POSTHOG_HOST'],
    readyTimeoutMs: FIRST_LOAD_WAIT_MS,
  });
  return processService;
}
