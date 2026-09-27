import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/en-XA/album.js').then((m) => m.messages),
  "bookings": () => import('../../locales/en-XA/bookings.js').then((m) => m.messages),
  "common": () => import('../../locales/en-XA/common.js').then((m) => m.messages),
  "community": () => import('../../locales/en-XA/community.js').then((m) => m.messages),
  "crew": () => import('../../locales/en-XA/crew.js').then((m) => m.messages),
  "critters": () => import('../../locales/en-XA/critters.js').then((m) => m.messages),
  "explore": () => import('../../locales/en-XA/explore.js').then((m) => m.messages),
  "guide": () => import('../../locales/en-XA/guide.js').then((m) => m.messages),
  "help": () => import('../../locales/en-XA/help.js').then((m) => m.messages),
  "home": () => import('../../locales/en-XA/home.js').then((m) => m.messages),
  "monetize": () => import('../../locales/en-XA/monetize.js').then((m) => m.messages),
  "money": () => import('../../locales/en-XA/money.js').then((m) => m.messages),
  "onboarding": () => import('../../locales/en-XA/onboarding.js').then((m) => m.messages),
  "plan": () => import('../../locales/en-XA/plan.js').then((m) => m.messages),
  "proposal": () => import('../../locales/en-XA/proposal.js').then((m) => m.messages),
  "recap": () => import('../../locales/en-XA/recap.js').then((m) => m.messages),
  "safety": () => import('../../locales/en-XA/safety.js').then((m) => m.messages),
  "server": () => import('../../locales/en-XA/server.js').then((m) => m.messages),
  "setup": () => import('../../locales/en-XA/setup.js').then((m) => m.messages),
  "surfaces": () => import('../../locales/en-XA/surfaces.js').then((m) => m.messages),
  "trip": () => import('../../locales/en-XA/trip.js').then((m) => m.messages),
  "vote": () => import('../../locales/en-XA/vote.js').then((m) => m.messages),
  "web": () => import('../../locales/en-XA/web.js').then((m) => m.messages),
  "you": () => import('../../locales/en-XA/you.js').then((m) => m.messages),
};
