import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/zh-Hans/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/zh-Hans/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/zh-Hans/common.js').then((m) => m.messages),
  "community": () => import('../../locales/zh-Hans/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/zh-Hans/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/zh-Hans/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/zh-Hans/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/zh-Hans/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/zh-Hans/help.js').then((m) => m.messages),
  "home": () => import('../../locales/zh-Hans/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/zh-Hans/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/zh-Hans/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/zh-Hans/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/zh-Hans/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/zh-Hans/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/zh-Hans/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/zh-Hans/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/zh-Hans/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/zh-Hans/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/zh-Hans/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/zh-Hans/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/zh-Hans/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/zh-Hans/web.js').then((m) => m.messages),
  "you": () => import('../../locales/zh-Hans/you.js').then((m) => m.messages),
};
