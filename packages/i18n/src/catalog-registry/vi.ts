import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/vi/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/vi/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/vi/common.js').then((m) => m.messages),
  "community": () => import('../../locales/vi/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/vi/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/vi/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/vi/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/vi/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/vi/help.js').then((m) => m.messages),
  "home": () => import('../../locales/vi/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/vi/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/vi/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/vi/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/vi/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/vi/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/vi/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/vi/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/vi/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/vi/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/vi/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/vi/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/vi/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/vi/web.js').then((m) => m.messages),
  "you": () => import('../../locales/vi/you.js').then((m) => m.messages),
};
