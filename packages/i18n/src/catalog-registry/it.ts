import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/it/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/it/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/it/common.js').then((m) => m.messages),
  "community": () => import('../../locales/it/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/it/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/it/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/it/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/it/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/it/help.js').then((m) => m.messages),
  "home": () => import('../../locales/it/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/it/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/it/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/it/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/it/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/it/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/it/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/it/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/it/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/it/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/it/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/it/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/it/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/it/web.js').then((m) => m.messages),
  "you": () => import('../../locales/it/you.js').then((m) => m.messages),
};
