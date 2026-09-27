import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/nl/album').then((m) => m.messages),
  "bookings": () => import('../../locales/nl/bookings').then((m) => m.messages),
  "common": () => import('../../locales/nl/common').then((m) => m.messages),
  "community": () => import('../../locales/nl/community').then((m) => m.messages),
  "crew": () => import('../../locales/nl/crew').then((m) => m.messages),
  "critters": () => import('../../locales/nl/critters').then((m) => m.messages),
  "explore": () => import('../../locales/nl/explore').then((m) => m.messages),
  "guide": () => import('../../locales/nl/guide').then((m) => m.messages),
  "help": () => import('../../locales/nl/help').then((m) => m.messages),
  "home": () => import('../../locales/nl/home').then((m) => m.messages),
  "monetize": () => import('../../locales/nl/monetize').then((m) => m.messages),
  "money": () => import('../../locales/nl/money').then((m) => m.messages),
  "onboarding": () => import('../../locales/nl/onboarding').then((m) => m.messages),
  "plan": () => import('../../locales/nl/plan').then((m) => m.messages),
  "proposal": () => import('../../locales/nl/proposal').then((m) => m.messages),
  "recap": () => import('../../locales/nl/recap').then((m) => m.messages),
  "safety": () => import('../../locales/nl/safety').then((m) => m.messages),
  "server": () => import('../../locales/nl/server').then((m) => m.messages),
  "setup": () => import('../../locales/nl/setup').then((m) => m.messages),
  "surfaces": () => import('../../locales/nl/surfaces').then((m) => m.messages),
  "trip": () => import('../../locales/nl/trip').then((m) => m.messages),
  "vote": () => import('../../locales/nl/vote').then((m) => m.messages),
  "web": () => import('../../locales/nl/web').then((m) => m.messages),
  "you": () => import('../../locales/nl/you').then((m) => m.messages),
};
