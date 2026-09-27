import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/th/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/th/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/th/common.js').then((m) => m.messages),
  "community": () => import('../../locales/th/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/th/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/th/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/th/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/th/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/th/help.js').then((m) => m.messages),
  "home": () => import('../../locales/th/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/th/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/th/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/th/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/th/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/th/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/th/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/th/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/th/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/th/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/th/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/th/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/th/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/th/web.js').then((m) => m.messages),
  "you": () => import('../../locales/th/you.js').then((m) => m.messages),
};
