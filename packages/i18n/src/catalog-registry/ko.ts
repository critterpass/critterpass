import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/ko/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/ko/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/ko/common.js').then((m) => m.messages),
  "community": () => import('../../locales/ko/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/ko/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/ko/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/ko/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/ko/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/ko/help.js').then((m) => m.messages),
  "home": () => import('../../locales/ko/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/ko/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/ko/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/ko/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/ko/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/ko/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/ko/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/ko/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/ko/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/ko/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/ko/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/ko/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/ko/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/ko/web.js').then((m) => m.messages),
  "you": () => import('../../locales/ko/you.js').then((m) => m.messages),
};
