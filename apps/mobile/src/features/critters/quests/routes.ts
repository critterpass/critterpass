/**
 * The crew quests route and the design id the navigation registry knows it by: 3l-7 opens over
 * the trip it belongs to.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export function questsRoute(tripId: string): Href {
  return { pathname: '/(trip)/quests/[tripId]', params: { tripId } };
}

let registered = false;

export function registerQuestScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens({
    '3l-7': (params: Readonly<Record<string, string>>) => questsRoute(params['tripId'] ?? ''),
  });
}
