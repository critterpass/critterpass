/* eslint-disable lingui/no-unlocalized-strings -- an error message for the logs, not UI copy. */
/**
 * Open Graph cards: `/og/invite/{code}.png`, `/og/referral/{code}.png`, `/og/plan/{token}.png`, `/og/tip/{slug}.png`
 * (lib/og/serve.ts). Drawn in the Worker with Takumi and kept in R2.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { planWords } from '../../../components/previews/plan-facts';
import { inviteCopy } from '../../../components/site/copy/invite';
import { tipsCopy } from '../../../components/site/copy/tips';
import { allTips, CATEGORY_COPY, TIP_CARD_COLOURS } from '../../../components/site/tips/tips-data';
import { siteTranslator } from '../../../components/site/i18n';
import { linkRequestContext, type LinksWebEnv } from '../../../lib/links/web-env';
import type { CardWords } from '../../../lib/og/cards';
import { serveOg, type OgEnv } from '../../../lib/og/serve';
import { tipTemplate } from '../../../lib/og/templates/tip';

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
    plan: (plan) => planWords(plan, t),
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
    publicCard: async (_kind, slug) => {
      const tip = (await allTips()).find((entry) => entry.slug === slug);
      if (tip === undefined) return null;
      const data = tip.data;
      const content = {
        eyebrow: `${t(CATEGORY_COPY[data.category])} · ${t(tipsCopy.minRead, { minutes: tip.minutes })}`,
        title: data.og.title ?? data.title,
        byline: t(tipsCopy.bylineBy, { guide: tip.guideName, place: tip.guidePlace }),
        background: TIP_CARD_COLOURS[tip.colour],
        guide: tip.guideKind,
      };
      return { node: tipTemplate(content), stickers: [tip.guideKind], content };
    },
    loadAsset: async (path) => {
      const response = await workerEnv.ASSETS.fetch(new Request(new URL(path, url)));
      if (!response.ok) throw new Error(`og: asset ${path} answered ${response.status}`);
      return response.arrayBuffer();
    },
  });
};
