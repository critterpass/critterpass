/**
 * The store's own write-a-review page for this app ("Rate the app" on the hub and in Settings):
 * opened directly, so it is never subject to the system's review-prompt quota.
 */
/* eslint-disable lingui/no-unlocalized-strings -- store URLs and identifiers, never copy. */

/** App Store ids by bundle id; the dev build reviews the store app. */
const APP_STORE_IDS: Readonly<Record<string, string>> = {
  'app.critterpass': '6816655856',
  'app.critterpass.staging': '6816656656',
  'app.critterpass.dev': '6816655856',
};

export function storeReviewUrl(platform: string, applicationId: string | null): string | null {
  if (platform === 'ios') {
    const id =
      APP_STORE_IDS[applicationId ?? 'app.critterpass'] ?? APP_STORE_IDS['app.critterpass'];
    return `itms-apps://apps.apple.com/app/id${id ?? ''}?action=write-review`;
  }
  if (platform === 'android') {
    return `market://details?id=${applicationId ?? 'app.critterpass'}&showAllReviews=true`;
  }
  return null;
}
