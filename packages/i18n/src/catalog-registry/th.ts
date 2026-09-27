import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/th/album').then((m) => m.messages),
  "bookings": () => import('../../locales/th/bookings').then((m) => m.messages),
  "common": () => import('../../locales/th/common').then((m) => m.messages),
  "community": () => import('../../locales/th/community').then((m) => m.messages),
  "crew": () => import('../../locales/th/crew').then((m) => m.messages),
  "critters": () => import('../../locales/th/critters').then((m) => m.messages),
  "explore": () => import('../../locales/th/explore').then((m) => m.messages),
  "guide": () => import('../../locales/th/guide').then((m) => m.messages),
  "help": () => import('../../locales/th/help').then((m) => m.messages),
  "home": () => import('../../locales/th/home').then((m) => m.messages),
  "monetize": () => import('../../locales/th/monetize').then((m) => m.messages),
  "money": () => import('../../locales/th/money').then((m) => m.messages),
  "onboarding": () => import('../../locales/th/onboarding').then((m) => m.messages),
  "plan": () => import('../../locales/th/plan').then((m) => m.messages),
  "proposal": () => import('../../locales/th/proposal').then((m) => m.messages),
  "recap": () => import('../../locales/th/recap').then((m) => m.messages),
  "safety": () => import('../../locales/th/safety').then((m) => m.messages),
  "server": () => import('../../locales/th/server').then((m) => m.messages),
  "setup": () => import('../../locales/th/setup').then((m) => m.messages),
  "surfaces": () => import('../../locales/th/surfaces').then((m) => m.messages),
  "trip": () => import('../../locales/th/trip').then((m) => m.messages),
  "vote": () => import('../../locales/th/vote').then((m) => m.messages),
  "web": () => import('../../locales/th/web').then((m) => m.messages),
  "you": () => import('../../locales/th/you').then((m) => m.messages),
};
