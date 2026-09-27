import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/tr/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/tr/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/tr/common.js').then((m) => m.messages),
  "community": () => import('../../locales/tr/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/tr/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/tr/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/tr/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/tr/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/tr/help.js').then((m) => m.messages),
  "home": () => import('../../locales/tr/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/tr/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/tr/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/tr/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/tr/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/tr/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/tr/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/tr/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/tr/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/tr/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/tr/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/tr/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/tr/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/tr/web.js').then((m) => m.messages),
  "you": () => import('../../locales/tr/you.js').then((m) => m.messages),
};
