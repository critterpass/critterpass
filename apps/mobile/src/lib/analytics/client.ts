/**
 * The app's only way to send product analytics: catalog events (`@cp/domain` analytics) through
 * PostHog EU, behind the consent gate. PostHog is created opted out (`defaultOptIn: false`), so
 * even its own lifecycle events wait for a grant; `capture` additionally drops every event while
 * the decision is not `granted`. Person profiles are `identified_only`, touch autocapture and
 * session replay are off, and `identify` runs only for a saved (non-anonymous) account after
 * consent, with the api-issued pseudonymous `user_pid`, never the uid.
 */
import {
  guardAnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventProps,
  type CommonProps,
} from '@cp/domain';
import PostHog, { type PostHogOptions } from 'posthog-react-native';

import { createConsentGate, type ConsentDecision, type ConsentGate } from './consent';

export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

/** The PostHog project key (public by design), inlined by Metro from `EXPO_PUBLIC_POSTHOG_KEY`. */
export function posthogKeyFromEnv(): string | undefined {
  const key = process.env['EXPO_PUBLIC_POSTHOG_KEY'];
  return key === undefined || key === '' ? undefined : key;
}

export interface AnalyticsViolation {
  readonly event: string;
  readonly reason: string;
  readonly detail: string;
}

export interface AnalyticsClientOptions {
  /** Unset (local builds without a key) → a client that never sends anything. */
  readonly apiKey: string | undefined;
  readonly host?: string;
  /** Development builds throw on catalog violations; release builds drop and report. */
  readonly dev: boolean;
  /** Release-build violation sink (a Sentry breadcrumb). */
  readonly onViolation?: (violation: AnalyticsViolation) => void;
  readonly initialConsent?: ConsentDecision;
  /** Masked, sampled onboarding + paywall replay; only when the `analytics.replay` flag is on. */
  readonly replay?: boolean;
  /** Flag values bootstrapped from the api so the first render needs no network. */
  readonly bootstrapFlags?: Readonly<Record<string, boolean | string>>;
  /** Test-only SDK overrides (in-memory persistence, immediate flush). */
  readonly sdkOverrides?: Partial<PostHogOptions>;
}

export interface Identity {
  readonly userPid: string;
  readonly anonymous: boolean;
}

export interface AnalyticsClient {
  readonly consent: ConsentGate;
  readonly capture: <N extends AnalyticsEventName>(event: N, props: AnalyticsEventProps<N>) => void;
  readonly screen: (routeName: string) => void;
  /** Experiment exposure (`$feature_flag_called`), reported once a variant has rendered. */
  readonly exposure: (flag: string, value: boolean | string) => void;
  readonly setConsent: (granted: boolean) => void;
  readonly setIdentity: (identity: Identity | null) => void;
  readonly setCommonProps: (props: CommonProps) => void;
  readonly reset: () => Promise<void>;
  readonly flush: () => Promise<void>;
  /** The SDK, for flag reads (./flags.ts); undefined without an api key. */
  readonly posthog: PostHog | undefined;
}

/** Catalog props are strings, numbers and booleans; optional ones may be absent. */
function definedProps(props: object): Record<string, string | number | boolean> {
  const entries = Object.entries(props) as [string, string | number | boolean | undefined][];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined),
  );
}

export function createAnalyticsClient(options: AnalyticsClientOptions): AnalyticsClient {
  const consent = createConsentGate(options.initialConsent);
  const posthog =
    options.apiKey === undefined || options.apiKey === ''
      ? undefined
      : new PostHog(options.apiKey, {
          host: options.host ?? POSTHOG_EU_HOST,
          personProfiles: 'identified_only',
          defaultOptIn: false,
          captureAppLifecycleEvents: true,
          // Flags come bootstrapped from the api; PostHog's own /flags call waits for consent,
          // and exposure is reported on variant render (./flags.ts), not on every read.
          preloadFeatureFlags: false,
          sendFeatureFlagEvent: false,
          enableSessionReplay: options.replay === true,
          sessionReplayConfig: {
            maskAllTextInputs: true,
            maskAllImages: true,
            maskAllSandboxedViews: true,
            captureLog: false,
            captureNetworkTelemetry: false,
            captureTouches: false,
            sampleRate: 0.1,
          },
          errorTracking: {
            autocapture: { uncaughtExceptions: false, unhandledRejections: false, console: [] },
          },
          ...(options.bootstrapFlags
            ? { bootstrap: { featureFlags: { ...options.bootstrapFlags } } }
            : {}),
          ...options.sdkOverrides,
        });
  let identity: Identity | null = null;
  let identified = false;
  let common: CommonProps = {};

  const granted = () => consent.decision() === 'granted';

  const applyIdentity = () => {
    if (!posthog || !granted() || identity === null || identity.anonymous || identified) return;
    posthog.identify(identity.userPid);
    identified = true;
  };

  const applyConsent = (decision: ConsentDecision) => {
    if (!posthog) return;
    if (decision === 'granted') {
      void posthog.optIn();
      applyIdentity();
      void posthog.reloadFeatureFlagsAsync().catch(() => undefined);
    } else {
      void posthog.optOut();
    }
  };
  consent.subscribe(applyConsent);
  applyConsent(consent.decision());

  const report = (violation: AnalyticsViolation) => {
    if (options.dev) {
      throw new Error(
        `analytics event ${violation.event} rejected (${violation.reason}: ${violation.detail})`,
      );
    }
    options.onViolation?.(violation);
  };

  return {
    consent,
    posthog,
    capture(event, props) {
      const result = guardAnalyticsEvent(event, { ...common, ...props });
      if (!result.ok) {
        report({ event, reason: result.reason, detail: result.detail });
        return;
      }
      if (!posthog || !granted()) return;
      posthog.capture(event, definedProps(result.properties));
    },
    screen(routeName) {
      if (!posthog || !granted()) return;
      void posthog.screen(routeName, definedProps(common));
    },
    exposure(flag, value) {
      if (!posthog || !granted()) return;
      posthog.capture('$feature_flag_called', {
        $feature_flag: flag,
        $feature_flag_response: value,
      });
    },
    setConsent(isGranted) {
      consent.set(isGranted ? 'granted' : 'denied');
    },
    setIdentity(next) {
      if (next?.userPid !== identity?.userPid) identified = false;
      identity = next;
      applyIdentity();
    },
    setCommonProps(props) {
      common = props;
    },
    async reset() {
      identity = null;
      identified = false;
      common = {};
      posthog?.reset();
      // The next person on this device has not decided yet; nothing is sent until they do.
      consent.set('undecided');
      await posthog?.optOut();
    },
    async flush() {
      // An unreachable PostHog loses the batch; analytics never fails the caller.
      await posthog?.flush().catch(() => undefined);
    },
  };
}
