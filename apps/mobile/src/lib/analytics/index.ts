/**
 * Mobile product analytics. The app root creates one client, wraps the tree in
 * `AnalyticsProvider`, feeds the consent gate from the synced `consents` rows
 * (`decisionFromRows`) and registers `client.reset` as a sign-out hook (data/auth
 * `registerOnSignOut`), so a sign-out or account switch forgets the person and the decision.
 */
export {
  createAnalyticsClient,
  POSTHOG_EU_HOST,
  posthogKeyFromEnv,
  type AnalyticsClient,
  type AnalyticsClientOptions,
  type AnalyticsViolation,
  type Identity,
} from './client';
export {
  ANALYTICS_CONSENT_PURPOSE,
  createConsentGate,
  decisionFromRows,
  type ConsentDecision,
  type ConsentGate,
  type ConsentRow,
} from './consent';
export { readFlag, useFlag } from './flags';
export { routeNameFromSegments, useScreenTracking } from './screen-tracking';
export {
  applyServerFlags,
  clearServerFlags,
  refreshServerFlags,
  SERVER_FLAGS_PATH,
  serverFlag,
  startServerFlags,
  type ServerFlagsFetch,
} from './server-flags';
export {
  AnalyticsProvider,
  deviceCommonProps,
  useAnalytics,
  useAnalyticsCommonProps,
} from './use-analytics';
