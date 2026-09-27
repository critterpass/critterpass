import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/ms/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/ms/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/ms/common.js').then((m) => m.messages),
  "community": () => import('../../locales/ms/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/ms/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/ms/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/ms/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/ms/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/ms/help.js').then((m) => m.messages),
  "home": () => import('../../locales/ms/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/ms/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/ms/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/ms/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/ms/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/ms/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/ms/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/ms/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/ms/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/ms/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/ms/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/ms/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/ms/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/ms/web.js').then((m) => m.messages),
  "you": () => import('../../locales/ms/you.js').then((m) => m.messages),
};
