import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/nl/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/nl/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/nl/common.js').then((m) => m.messages),
  "community": () => import('../../locales/nl/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/nl/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/nl/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/nl/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/nl/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/nl/help.js').then((m) => m.messages),
  "home": () => import('../../locales/nl/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/nl/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/nl/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/nl/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/nl/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/nl/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/nl/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/nl/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/nl/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/nl/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/nl/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/nl/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/nl/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/nl/web.js').then((m) => m.messages),
  "you": () => import('../../locales/nl/you.js').then((m) => m.messages),
};
