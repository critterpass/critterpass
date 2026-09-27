import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/es/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/es/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/es/common.js').then((m) => m.messages),
  "community": () => import('../../locales/es/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/es/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/es/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/es/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/es/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/es/help.js').then((m) => m.messages),
  "home": () => import('../../locales/es/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/es/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/es/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/es/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/es/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/es/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/es/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/es/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/es/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/es/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/es/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/es/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/es/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/es/web.js').then((m) => m.messages),
  "you": () => import('../../locales/es/you.js').then((m) => m.messages),
};
