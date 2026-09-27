import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/id/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/id/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/id/common.js').then((m) => m.messages),
  "community": () => import('../../locales/id/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/id/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/id/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/id/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/id/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/id/help.js').then((m) => m.messages),
  "home": () => import('../../locales/id/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/id/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/id/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/id/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/id/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/id/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/id/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/id/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/id/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/id/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/id/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/id/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/id/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/id/web.js').then((m) => m.messages),
  "you": () => import('../../locales/id/you.js').then((m) => m.messages),
};
