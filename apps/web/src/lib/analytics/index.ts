export {
  createWebAnalytics,
  installWebAnalytics,
  POSTHOG_CAPTURE_URL,
  WEB_CTAS,
  type WebAnalytics,
  type WebAnalyticsOptions,
} from './client';
export { installLazyErrorReporting, redactWebPath, redactWebUrl, scrubWebEvent } from './sentry';
