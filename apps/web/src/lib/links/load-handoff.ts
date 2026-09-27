/* eslint-disable lingui/no-unlocalized-strings -- header names, not UI copy. */
/**
 * The server side of every link page (`/i`, `/j`, `/p`, `/r`, `/plan`, `/g`, `/locals`, `/app`):
 * parse the path, fetch the public preview, decide redirect / render / not found, and prepare the
 * words and the desktop QR code. Pages call this and hand the result to `Handoff.astro`.
 */
import { env } from 'cloudflare:workers';
import { renderSVG } from 'uqr';

import { channelOf, decideHandoff, targetOf, type HandoffModel } from './handoff-model';
import { expiresIn, handoffCopy, NOT_FOUND_COPY, type HandoffCopy } from './handoff-copy';
import { fetchLinkPreview } from './resolver-fetch';
import { appStoreUrl, playStoreUrl } from './store-url';
import { linkRequestContext, type LinksWebEnv } from './web-env';

export type LoadedHandoff =
  | { readonly kind: 'redirect'; readonly location: string }
  | {
      readonly kind: 'page';
      readonly status: 200 | 404;
      readonly model: HandoffModel | null;
      readonly copy: HandoffCopy;
      readonly expires: string | null;
      readonly qrSvg: string | null;
      /** Store buttons, shown on every page (with the link's referrer when there is a link). */
      readonly appStoreHref: string | null;
      readonly playStoreHref: string;
    };

export async function loadHandoff(request: Request, url: URL): Promise<LoadedHandoff> {
  const webEnv = env as unknown as LinksWebEnv;
  const context = linkRequestContext(url, webEnv);
  const target = targetOf(url);
  const notFound: LoadedHandoff = {
    kind: 'page',
    status: 404,
    model: null,
    copy: NOT_FOUND_COPY,
    expires: null,
    qrSvg: null,
    appStoreHref: appStoreUrl(context.config),
    playStoreHref: playStoreUrl(context.config, null),
  };
  if (target === null) return notFound;

  const userAgent = request.headers.get('user-agent');
  const preview = await fetchLinkPreview({
    apiBaseUrl: context.apiBaseUrl,
    target,
    channel: channelOf(url),
    visitorIp: request.headers.get('cf-connecting-ip'),
    visitorUserAgent: userAgent,
    proxySecret: webEnv.LINKS_WEB_PROXY_SECRET,
  });
  const decision = decideHandoff({ url, userAgent, context, target, preview });
  if (decision.kind === 'redirect') return { kind: 'redirect', location: decision.location };
  if (decision.kind === 'not_found') return notFound;

  const { model } = decision;
  return {
    kind: 'page',
    status: 200,
    model,
    copy: handoffCopy(model.target, model.preview),
    expires: expiresIn(model.preview?.expires_at ?? null, new Date()),
    qrSvg:
      model.platform === 'desktop'
        ? renderSVG(`https://${context.otherHost}${model.path}`, { border: 1 })
        : null,
    appStoreHref: model.appStoreHref,
    playStoreHref: model.playStoreHref,
  };
}
