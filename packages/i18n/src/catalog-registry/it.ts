import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/it/album').then((m) => m.messages),
  "bookings": () => import('../../locales/it/bookings').then((m) => m.messages),
  "common": () => import('../../locales/it/common').then((m) => m.messages),
  "community": () => import('../../locales/it/community').then((m) => m.messages),
  "crew": () => import('../../locales/it/crew').then((m) => m.messages),
  "critters": () => import('../../locales/it/critters').then((m) => m.messages),
  "explore": () => import('../../locales/it/explore').then((m) => m.messages),
  "guide": () => import('../../locales/it/guide').then((m) => m.messages),
  "help": () => import('../../locales/it/help').then((m) => m.messages),
  "home": () => import('../../locales/it/home').then((m) => m.messages),
  "monetize": () => import('../../locales/it/monetize').then((m) => m.messages),
  "money": () => import('../../locales/it/money').then((m) => m.messages),
  "onboarding": () => import('../../locales/it/onboarding').then((m) => m.messages),
  "plan": () => import('../../locales/it/plan').then((m) => m.messages),
  "proposal": () => import('../../locales/it/proposal').then((m) => m.messages),
  "recap": () => import('../../locales/it/recap').then((m) => m.messages),
  "safety": () => import('../../locales/it/safety').then((m) => m.messages),
  "server": () => import('../../locales/it/server').then((m) => m.messages),
  "setup": () => import('../../locales/it/setup').then((m) => m.messages),
  "surfaces": () => import('../../locales/it/surfaces').then((m) => m.messages),
  "trip": () => import('../../locales/it/trip').then((m) => m.messages),
  "vote": () => import('../../locales/it/vote').then((m) => m.messages),
  "web": () => import('../../locales/it/web').then((m) => m.messages),
  "you": () => import('../../locales/it/you').then((m) => m.messages),
};
