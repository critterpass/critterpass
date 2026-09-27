import type { Messages } from '@lingui/core';

/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */
export const catalogs: Record<string, () => Promise<Messages>> = {
  "album": () => import('../../locales/ja/album').then((m) => m.messages),
  "bookings": () => import('../../locales/ja/bookings').then((m) => m.messages),
  "common": () => import('../../locales/ja/common').then((m) => m.messages),
  "community": () => import('../../locales/ja/community').then((m) => m.messages),
  "crew": () => import('../../locales/ja/crew').then((m) => m.messages),
  "critters": () => import('../../locales/ja/critters').then((m) => m.messages),
  "explore": () => import('../../locales/ja/explore').then((m) => m.messages),
  "guide": () => import('../../locales/ja/guide').then((m) => m.messages),
  "help": () => import('../../locales/ja/help').then((m) => m.messages),
  "home": () => import('../../locales/ja/home').then((m) => m.messages),
  "monetize": () => import('../../locales/ja/monetize').then((m) => m.messages),
  "money": () => import('../../locales/ja/money').then((m) => m.messages),
  "onboarding": () => import('../../locales/ja/onboarding').then((m) => m.messages),
  "plan": () => import('../../locales/ja/plan').then((m) => m.messages),
  "proposal": () => import('../../locales/ja/proposal').then((m) => m.messages),
  "recap": () => import('../../locales/ja/recap').then((m) => m.messages),
  "safety": () => import('../../locales/ja/safety').then((m) => m.messages),
  "server": () => import('../../locales/ja/server').then((m) => m.messages),
  "setup": () => import('../../locales/ja/setup').then((m) => m.messages),
  "surfaces": () => import('../../locales/ja/surfaces').then((m) => m.messages),
  "trip": () => import('../../locales/ja/trip').then((m) => m.messages),
  "vote": () => import('../../locales/ja/vote').then((m) => m.messages),
  "web": () => import('../../locales/ja/web').then((m) => m.messages),
  "you": () => import('../../locales/ja/you').then((m) => m.messages),
};
