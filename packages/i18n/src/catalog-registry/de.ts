import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/de/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/de/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/de/common.js').then((m) => m.messages),
  "community": () => import('../../locales/de/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/de/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/de/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/de/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/de/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/de/help.js').then((m) => m.messages),
  "home": () => import('../../locales/de/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/de/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/de/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/de/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/de/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/de/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/de/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/de/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/de/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/de/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/de/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/de/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/de/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/de/web.js').then((m) => m.messages),
  "you": () => import('../../locales/de/you.js').then((m) => m.messages),
};
