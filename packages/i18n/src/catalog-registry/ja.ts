import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/ja/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/ja/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/ja/common.js').then((m) => m.messages),
  "community": () => import('../../locales/ja/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/ja/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/ja/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/ja/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/ja/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/ja/help.js').then((m) => m.messages),
  "home": () => import('../../locales/ja/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/ja/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/ja/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/ja/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/ja/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/ja/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/ja/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/ja/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/ja/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/ja/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/ja/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/ja/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/ja/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/ja/web.js').then((m) => m.messages),
  "you": () => import('../../locales/ja/you.js').then((m) => m.messages),
};
