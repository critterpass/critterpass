import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/pt/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/pt/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/pt/common.js').then((m) => m.messages),
  "community": () => import('../../locales/pt/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/pt/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/pt/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/pt/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/pt/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/pt/help.js').then((m) => m.messages),
  "home": () => import('../../locales/pt/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/pt/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/pt/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/pt/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/pt/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/pt/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/pt/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/pt/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/pt/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/pt/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/pt/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/pt/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/pt/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/pt/web.js').then((m) => m.messages),
  "you": () => import('../../locales/pt/you.js').then((m) => m.messages),
};
