import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/vi/album').then((m) => m.messages),
  "bookings": () => import('../../locales/vi/bookings').then((m) => m.messages),
  "common": () => import('../../locales/vi/common').then((m) => m.messages),
  "community": () => import('../../locales/vi/community').then((m) => m.messages),
  "crew": () => import('../../locales/vi/crew').then((m) => m.messages),
  "critters": () => import('../../locales/vi/critters').then((m) => m.messages),
  "explore": () => import('../../locales/vi/explore').then((m) => m.messages),
  "guide": () => import('../../locales/vi/guide').then((m) => m.messages),
  "help": () => import('../../locales/vi/help').then((m) => m.messages),
  "home": () => import('../../locales/vi/home').then((m) => m.messages),
  "monetize": () => import('../../locales/vi/monetize').then((m) => m.messages),
  "money": () => import('../../locales/vi/money').then((m) => m.messages),
  "onboarding": () => import('../../locales/vi/onboarding').then((m) => m.messages),
  "plan": () => import('../../locales/vi/plan').then((m) => m.messages),
  "proposal": () => import('../../locales/vi/proposal').then((m) => m.messages),
  "recap": () => import('../../locales/vi/recap').then((m) => m.messages),
  "safety": () => import('../../locales/vi/safety').then((m) => m.messages),
  "server": () => import('../../locales/vi/server').then((m) => m.messages),
  "setup": () => import('../../locales/vi/setup').then((m) => m.messages),
  "surfaces": () => import('../../locales/vi/surfaces').then((m) => m.messages),
  "trip": () => import('../../locales/vi/trip').then((m) => m.messages),
  "vote": () => import('../../locales/vi/vote').then((m) => m.messages),
  "web": () => import('../../locales/vi/web').then((m) => m.messages),
  "you": () => import('../../locales/vi/you').then((m) => m.messages),
};
