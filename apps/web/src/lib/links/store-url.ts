/* eslint-disable lingui/no-unlocalized-strings -- store URLs, not UI copy. */
/**
 * Store destinations for a link page. The Play URL carries the link path in the install referrer
 * (`referrer=cp_link%3D<url-encoded path>`), which the app reads once on first launch, so an
 * Android install lands on the invite without typing anything.
 */
import { appClipBundleId, type LinkEnvironmentConfig } from '@cp/domain';

export const INSTALL_REFERRER_LINK_PARAM = 'cp_link';

/** Play listing; with a link path, the path rides along in the install referrer. */
export function playStoreUrl(config: LinkEnvironmentConfig, linkPath: string | null): string {
  const query = new URLSearchParams({ id: config.appId });
  if (linkPath !== null) {
    query.set('referrer', `${INSTALL_REFERRER_LINK_PARAM}=${encodeURIComponent(linkPath)}`);
  }
  return `https://play.google.com/store/apps/details?${query.toString()}`;
}

/** null when this environment's app is not on the App Store (development builds). */
export function appStoreUrl(config: LinkEnvironmentConfig): string | null {
  return config.appStoreId === null ? null : `https://apps.apple.com/app/id${config.appStoreId}`;
}

/**
 * `apple-itunes-app` Smart App Banner content; the app receives `app-argument` when opened. With
 * the `links.app_clip` flag on, Safari shows the App Clip card instead of the install banner.
 */
export function smartAppBannerContent(
  config: LinkEnvironmentConfig,
  canonicalLink: string,
  options: { readonly appClip?: boolean } = {},
): string | null {
  if (config.appStoreId === null) return null;
  const banner = `app-id=${config.appStoreId}, app-argument=${canonicalLink}`;
  return options.appClip === true
    ? `${banner}, app-clip-bundle-id=${appClipBundleId(config.appId)}, app-clip-display=card`
    : banner;
}
