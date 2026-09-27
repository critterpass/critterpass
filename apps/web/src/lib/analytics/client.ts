/* eslint-disable lingui/no-unlocalized-strings -- not JSX; event names and API fields. */
/**
 * Cookieless product analytics for critterpass.app: page views and CTA clicks only, sent to
 * PostHog EU's capture endpoint with `sendBeacon`. Nothing is stored on the device (no cookie,
 * no localStorage, no sessionStorage): the distinct id lives in memory for one page load, there
 * is no identify, and no person profile is created. This keeps the SDK out of the invite
 * landing's JS budget while matching posthog-js with `persistence: 'memory'`. URLs are reduced
 * to their route (link codes and query strings removed).
 */
import { redactWebUrl } from './sentry';

export const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/i/v0/e/';
const CTA_ID = /^[a-z0-9_]{1,40}$/u;

export interface WebAnalyticsOptions {
  readonly apiKey: string | undefined;
  readonly captureUrl?: string;
  /** Transport (tests); defaults to `navigator.sendBeacon`, falling back to `fetch` keepalive. */
  readonly send?: (url: string, body: string) => void;
}

export interface WebAnalytics {
  pageview(url: string, referrer?: string): void;
  cta(cta: string): void;
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultSend(url: string, body: string): void {
  const blob = new Blob([body], { type: 'text/plain' });
  if (typeof navigator !== 'undefined' && navigator.sendBeacon(url, blob)) return;
  void fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(
    () => undefined,
  );
}

export function createWebAnalytics(options: WebAnalyticsOptions): WebAnalytics {
  const distinctId = `web_${randomId()}`;
  const send = options.send ?? defaultSend;
  const url = options.captureUrl ?? POSTHOG_CAPTURE_URL;
  const capture = (event: string, properties: Record<string, unknown>) => {
    if (!options.apiKey) return;
    send(
      url,
      JSON.stringify({
        api_key: options.apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $process_person_profile: false, $lib: 'critterpass-web' },
        timestamp: new Date().toISOString(),
        uuid: randomId(),
      }),
    );
  };
  return {
    pageview(pageUrl, referrer) {
      const current = redactWebUrl(pageUrl);
      let referringDomain: string | undefined;
      try {
        referringDomain = referrer ? new URL(referrer).hostname : undefined;
      } catch {
        referringDomain = undefined;
      }
      capture('$pageview', {
        $current_url: current,
        $pathname: new URL(current).pathname,
        surface: 'web',
        ...(referringDomain ? { $referring_domain: referringDomain } : {}),
      });
    },
    cta(cta) {
      // The catalog's `cta_clicked.cta` shape, checked here without shipping zod to the page.
      if (CTA_ID.test(cta)) capture('cta_clicked', { cta, surface: 'web', platform: 'web' });
    },
  };
}

/** The site's calls to action, by their existing `data-cs` hooks (or an explicit `data-cta`). */
export const WEB_CTAS = new Set([
  'nav_cta',
  'final_cta',
  'join_submit',
  'copy_link',
  'share_whatsapp',
  'share_messages',
  'share_instagram',
  'egg_button',
  'hatch_again',
]);

/** Page view on load, and `cta_clicked` for every click on a known call to action. */
export function installWebAnalytics(
  options: WebAnalyticsOptions,
  target: Document = document,
): WebAnalytics {
  const analytics = createWebAnalytics(options);
  analytics.pageview(target.location.href, target.referrer);
  target.addEventListener('click', (event) => {
    const element =
      event.target instanceof Element ? event.target.closest('[data-cta],[data-cs]') : null;
    const cta = (element?.getAttribute('data-cta') ?? element?.getAttribute('data-cs'))?.replaceAll(
      '-',
      '_',
    );
    if (cta && WEB_CTAS.has(cta)) analytics.cta(cta);
  });
  return analytics;
}
