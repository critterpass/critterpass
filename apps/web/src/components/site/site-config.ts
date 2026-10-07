/* eslint-disable lingui/no-unlocalized-strings -- URLs, paths and anchors, not UI copy. */
/**
 * Site-wide destinations: the production store listings (the marketing site always sends people to
 * the public apps, whichever host serves it), the site's own sections, and social accounts. A social
 * account without a URL renders no link (TikTok and X have no account yet).
 */
import { LINK_ENVIRONMENT_CONFIG } from '@cp/domain';

import { appStoreUrl, playStoreUrl } from '../../lib/links/store-url';

const PRODUCTION = LINK_ENVIRONMENT_CONFIG.production;

export const STORE_LINKS = {
  appStore: appStoreUrl(PRODUCTION),
  googlePlay: playStoreUrl(PRODUCTION, null),
} as const;

export const SITE_PATHS = {
  home: '/',
  howItWorks: '/#how-it-works',
  theLocals: '/#the-locals',
  thePass: '/#the-pass',
  getTheApp: '/#get-the-app',
  tips: '/tips',
  bringYourCrew: '/r',
  joinWithCode: '/j',
  legal: '/legal',
  privacy: '/legal/privacy',
  terms: '/legal/terms',
  subscriptionTerms: '/legal/subscription-terms',
  pricing: '/pricing',
  deleteAccount: '/account/delete',
} as const;

export type NavKey = 'howItWorks' | 'theLocals' | 'tips' | 'bringYourCrew';

export const SOCIAL_LINKS: readonly { readonly key: string; readonly href: string | null }[] = [
  { key: 'Instagram', href: 'https://www.instagram.com/critterpass.app' },
  { key: 'TikTok', href: null },
  { key: 'X', href: null },
];

export const CONTACT_EMAIL = 'hello@critterpass.app';
