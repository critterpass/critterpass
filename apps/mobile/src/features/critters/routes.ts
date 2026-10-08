/**
 * The critter routes and the design ids the navigation registry knows them by: the PASS tab
 * (3l-2), a set (3l-8), a critter (3l-3), the legendary calendar (3l-9), the hatch (3l-1) and an
 * encounter (3l-4).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const PASS_TAB: Href = '/(tabs)/pass';

/** The PASS tab; with `landed`, the critter just added, whose set the dex scrolls to and outlines. */
export function passRoute(landed?: string): Href {
  return landed === undefined ? PASS_TAB : { pathname: '/(tabs)/pass', params: { landed } };
}

/** A crew's chat, where a find is shared from Befriended. */
export function crewChatRoute(crewId: string): Href {
  return { pathname: '/crew/[crewId]/chat', params: { crewId } };
}

export function setRoute(setId: string): Href {
  return { pathname: '/critters/set/[setId]', params: { setId } };
}

export function critterRoute(critterId: string): Href {
  return { pathname: '/critters/[critterId]', params: { critterId } };
}

/** Where, when and how to meet one form: its spots on a map and the steps (an undesigned screen). */
export function whereRoute(formId: string): Href {
  return { pathname: '/critters/where/[formId]', params: { formId } };
}

export const LEGENDARIES_ROUTE: Href = '/critters/legendaries';

export function hatchRoute(tripId: string): Href {
  return { pathname: '/(modal)/hatch/[tripId]', params: { tripId } };
}

export function encounterRoute(encounterId: string): Href {
  return { pathname: '/(trip)/encounter/[id]', params: { id: encounterId } };
}

export const CRITTER_SCREENS = {
  '3l-1': (params: Readonly<Record<string, string>>) => hatchRoute(params['tripId'] ?? ''),
  '3l-2': PASS_TAB,
  '3l-3': (params: Readonly<Record<string, string>>) => critterRoute(params['critterId'] ?? ''),
  '3l-4': (params: Readonly<Record<string, string>>) => encounterRoute(params['id'] ?? 'nearby'),
  '3l-8': (params: Readonly<Record<string, string>>) => setRoute(params['setId'] ?? ''),
  '3l-9': LEGENDARIES_ROUTE,
} as const;

let registered = false;

export function registerCritterScreens(): void {
  if (registered) return;
  registered = true;
  registerScreens(CRITTER_SCREENS);
}
