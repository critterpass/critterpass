import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/de/album').then((m) => m.messages),
  "bookings": () => import('../../locales/de/bookings').then((m) => m.messages),
  "common": () => import('../../locales/de/common').then((m) => m.messages),
  "community": () => import('../../locales/de/community').then((m) => m.messages),
  "crew": () => import('../../locales/de/crew').then((m) => m.messages),
  "critters": () => import('../../locales/de/critters').then((m) => m.messages),
  "explore": () => import('../../locales/de/explore').then((m) => m.messages),
  "guide": () => import('../../locales/de/guide').then((m) => m.messages),
  "help": () => import('../../locales/de/help').then((m) => m.messages),
  "home": () => import('../../locales/de/home').then((m) => m.messages),
  "monetize": () => import('../../locales/de/monetize').then((m) => m.messages),
  "money": () => import('../../locales/de/money').then((m) => m.messages),
  "onboarding": () => import('../../locales/de/onboarding').then((m) => m.messages),
  "plan": () => import('../../locales/de/plan').then((m) => m.messages),
  "proposal": () => import('../../locales/de/proposal').then((m) => m.messages),
  "recap": () => import('../../locales/de/recap').then((m) => m.messages),
  "safety": () => import('../../locales/de/safety').then((m) => m.messages),
  "server": () => import('../../locales/de/server').then((m) => m.messages),
  "setup": () => import('../../locales/de/setup').then((m) => m.messages),
  "surfaces": () => import('../../locales/de/surfaces').then((m) => m.messages),
  "trip": () => import('../../locales/de/trip').then((m) => m.messages),
  "vote": () => import('../../locales/de/vote').then((m) => m.messages),
  "web": () => import('../../locales/de/web').then((m) => m.messages),
  "you": () => import('../../locales/de/you').then((m) => m.messages),
};
