/* eslint-disable lingui/no-unlocalized-strings -- an error message for the logs, not UI copy. */
/**
 * Open Graph cards: `/og/invite/{code}.png`, `/og/referral/{code}.png`, `/og/tip/{slug}.png`
 * (lib/og/serve.ts). Drawn in the Worker with Takumi and kept in R2.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { inviteCopy } from '../../../components/site/copy/invite';
import { siteTranslator } from '../../../components/site/i18n';
import { linkRequestContext, type LinksWebEnv } from '../../../lib/links/web-env';
import type { CardWords } from '../../../lib/og/cards';
import { serveOg, type OgEnv } from '../../../lib/og/serve';

export const prerender = false;

interface OgWorkerEnv extends LinksWebEnv, OgEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

export const GET: APIRoute = async ({ params, request, url }) => {
  const workerEnv = env as unknown as OgWorkerEnv;
  const t = await siteTranslator();
  const words: CardWords = {
    referralTitle: t(inviteCopy.referralTitle),
    referralEyebrow: (name) =>
      name === null ? t(inviteCopy.referralEyebrow) : t(inviteCopy.referralEyebrowFrom, { name }),
    referralBody: (name) =>
      name === null ? t(inviteCopy.referralBody) : t(inviteCopy.referralBodyFrom, { name }),
    estimateEach: (amount) => t(inviteCopy.estimateEach, { amount }),
  };
  const context = linkRequestContext(url, workerEnv);
  return serveOg({
    kind: params['kind'] ?? '',
    id: params['id'] ?? '',
    request,
    apiBaseUrl: context.apiBaseUrl,
    proxySecret: workerEnv.LINKS_WEB_PROXY_SECRET,
    env: workerEnv,
    words,
    loadAsset: async (path) => {
      const response = await workerEnv.ASSETS.fetch(new Request(new URL(path, url)));
      if (!response.ok) throw new Error(`og: asset ${path} answered ${response.status}`);
      return response.arrayBuffer();
    },
  });
};
