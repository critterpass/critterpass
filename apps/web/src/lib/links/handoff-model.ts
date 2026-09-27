/* eslint-disable lingui/no-unlocalized-strings -- URLs and query keys, not UI copy. */
/**
 * Everything a link page needs to render its handoff, decided in one testable place: the parsed
 * target, the canonical link the app understands, where "Open in app" and the store buttons go on
 * this device, and whether an iOS "open" tap that reached the server (so the app is not installed)
 * should go straight on to the App Store.
 */
import {
  buildLink,
  linkPath,
  parseLinkPath,
  type LinkChannel,
  type LinkPreview,
  type LinkTarget,
  LINK_CHANNELS,
} from '@cp/domain';

import { openAppIntent, openInChromeIntent } from './intent-url';
import type { PreviewOutcome } from './resolver-fetch';
import { appStoreUrl, playStoreUrl, smartAppBannerContent } from './store-url';
import { readUserAgent, type InAppBrowser, type LinkPlatform } from './ua';
import type { LinkRequestContext } from './web-env';

/** Query flag on "Open in app" taps; reaching the server with it means the app did not open. */
export const OPEN_TAP_PARAM = 'open';

export interface HandoffModel {
  readonly target: LinkTarget;
  readonly path: string;
  /** `https://<primary host><path>`: what the page copies and the app parses. */
  readonly canonicalLink: string;
  readonly code: string | null;
  readonly preview: LinkPreview | null;
  readonly platform: LinkPlatform;
  readonly inAppBrowser: InAppBrowser | null;
  readonly openInAppHref: string;
  readonly appStoreHref: string | null;
  readonly playStoreHref: string;
  readonly smartAppBanner: string | null;
  /** Android only: lifts the page out of an in-app browser into Chrome. */
  readonly openInChromeHref: string | null;
}

export type HandoffDecision =
  | { readonly kind: 'render'; readonly model: HandoffModel }
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'not_found' };

export function channelOf(url: URL): LinkChannel | null {
  const value = url.searchParams.get('c');
  return value !== null && (LINK_CHANNELS as readonly string[]).includes(value)
    ? (value as LinkChannel)
    : null;
}

/** The link target of a page URL (`/i/…`, `/j/…`, …), or null when the path is not a valid link. */
export function targetOf(url: URL): LinkTarget | null {
  return parseLinkPath(url.pathname);
}

export function decideHandoff(input: {
  readonly url: URL;
  readonly userAgent: string | null;
  readonly context: LinkRequestContext;
  readonly target: LinkTarget;
  readonly preview: PreviewOutcome;
  /** The `links.app_clip` flag (link-settings.ts); off when absent. */
  readonly appClip?: boolean;
}): HandoffDecision {
  const { url, context, target } = input;
  if (input.preview.status === 'not_found') return { kind: 'not_found' };
  const { platform, inAppBrowser } = readUserAgent(input.userAgent);
  const path = linkPath(target);
  const appStoreHref = appStoreUrl(context.config);
  const playStoreHref = playStoreUrl(context.config, path);

  if (
    url.searchParams.get(OPEN_TAP_PARAM) === '1' &&
    platform === 'ios' &&
    inAppBrowser === null &&
    appStoreHref !== null
  ) {
    return { kind: 'redirect', location: appStoreHref };
  }

  const canonicalLink = buildLink(target, { host: context.config.primaryHost });
  const openInAppHref =
    platform === 'android'
      ? openAppIntent({
          host: context.otherHost,
          path,
          packageName: context.config.appId,
          fallbackUrl: playStoreHref,
        })
      : `https://${context.otherHost}${path}${platform === 'ios' ? `?${OPEN_TAP_PARAM}=1` : ''}`;

  return {
    kind: 'render',
    model: {
      target,
      path,
      canonicalLink,
      code: target.kind === 'invite' || target.kind === 'referral' ? target.code : null,
      preview: input.preview.status === 'found' ? input.preview.preview : null,
      platform,
      inAppBrowser,
      openInAppHref,
      appStoreHref,
      playStoreHref,
      smartAppBanner: smartAppBannerContent(context.config, canonicalLink, {
        appClip: input.appClip === true,
      }),
      openInChromeHref:
        platform === 'android' && inAppBrowser !== null
          ? openInChromeIntent({ host: context.host, path: `${url.pathname}${url.search}` })
          : null,
    },
  };
}
