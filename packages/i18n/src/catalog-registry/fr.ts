import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/fr/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/fr/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/fr/common.js').then((m) => m.messages),
  "community": () => import('../../locales/fr/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/fr/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/fr/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/fr/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/fr/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/fr/help.js').then((m) => m.messages),
  "home": () => import('../../locales/fr/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/fr/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/fr/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/fr/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/fr/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/fr/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/fr/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/fr/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/fr/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/fr/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/fr/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/fr/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/fr/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/fr/web.js').then((m) => m.messages),
  "you": () => import('../../locales/fr/you.js').then((m) => m.messages),
};
