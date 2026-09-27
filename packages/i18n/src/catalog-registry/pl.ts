import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/pl/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/pl/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/pl/common.js').then((m) => m.messages),
  "community": () => import('../../locales/pl/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/pl/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/pl/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/pl/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/pl/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/pl/help.js').then((m) => m.messages),
  "home": () => import('../../locales/pl/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/pl/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/pl/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/pl/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/pl/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/pl/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/pl/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/pl/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/pl/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/pl/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/pl/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/pl/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/pl/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/pl/web.js').then((m) => m.messages),
  "you": () => import('../../locales/pl/you.js').then((m) => m.messages),
};
