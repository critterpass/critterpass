import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/en/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/en/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/en/common.js').then((m) => m.messages),
  "community": () => import('../../locales/en/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/en/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/en/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/en/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/en/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/en/help.js').then((m) => m.messages),
  "home": () => import('../../locales/en/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/en/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/en/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/en/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/en/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/en/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/en/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/en/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/en/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/en/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/en/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/en/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/en/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/en/web.js').then((m) => m.messages),
  "you": () => import('../../locales/en/you.js').then((m) => m.messages),
};
