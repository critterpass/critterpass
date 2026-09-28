/**
 * `og.render`: asks the web Worker for one invite or referral share card
 * (`GET {web}/og/{kind}/{code}.png?warm=1`), so drawing stays in one place. For a live code the
 * Worker draws the card into its R2 cache (or finds it there); for a revoked, rotated or expired
 * code it answers 404 and deletes the cached card. The request identifies itself as a preview bot,
 * so the link preview it triggers is never counted as someone opening the invite.
 */
import {
  LINK_ENVIRONMENT_CONFIG,
  OG_RENDER_QUEUE,
  ogCardPath,
  ogRenderJobSchema,
  ogRenderSingletonKey,
  type LinkEnvironment,
} from '@cp/domain';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

/** Contains `bot/` and `preview`, both on the api's link-open bot list. */
export const OG_WARM_USER_AGENT =
  'CritterPassCardWarmer/1.0 (preview bot/1.0; +https://critterpass.app)';

const REQUEST_TIMEOUT_MS = 30_000;

export interface OgRenderOptions {
  /** The web origin; undefined = no web to ask (local), and each job completes as skipped. */
  readonly webBaseUrl: string | undefined;
  /** Network boundary override (tests). */
  readonly fetch?: typeof fetch;
}

const WEB_ENV_BY_APP_ENV: Readonly<Record<string, LinkEnvironment | undefined>> = {
  production: 'production',
  staging: 'staging',
};

/** `WEB_BASE_URL`, else the primary link host of the deployment tier; none for local runs. */
export function ogWebBaseUrl(appEnv: string, override: string | undefined): string | undefined {
  if (override !== undefined) return override.replace(/\/+$/u, '');
  const env = WEB_ENV_BY_APP_ENV[appEnv];
  return env === undefined ? undefined : `https://${LINK_ENVIRONMENT_CONFIG[env].primaryHost}`;
}

export function ogRenderJob(options: OgRenderOptions): AnyJobDefinition {
  const send = options.fetch ?? fetch;
  return defineJob({
    queue: OG_RENDER_QUEUE,
    schema: ogRenderJobSchema,
    singletonKey: ogRenderSingletonKey,
    async handler(data, ctx) {
      if (options.webBaseUrl === undefined) return { card: 'skipped' };
      const url = `${options.webBaseUrl}${ogCardPath(data)}?warm=1`;
      const response = await send(url, {
        headers: { 'user-agent': OG_WARM_USER_AGENT, accept: 'image/png' },
        signal: AbortSignal.any([ctx.job.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      await response.body?.cancel();
      if (response.status === 404) return { kind: data.kind, card: 'purged' };
      const cache = response.headers.get('x-og-cache');
      // The site card stands in while the api is unreachable: try again later.
      if (!response.ok || cache === 'fallback') {
        throw new Error(
          `og card ${data.kind} answered ${response.status} (${cache ?? 'no cache'})`,
        );
      }
      return { kind: data.kind, card: cache === 'hit' ? 'cached' : 'drawn' };
    },
  });
}
