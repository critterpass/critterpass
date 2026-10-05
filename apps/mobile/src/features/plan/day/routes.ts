/**
 * The plan editing routes and the ones they link to by path: a place's detail, the change review
 * (3e-3) a guide suggestion opens, and the day's live decision (3g-2).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and URL schemes, never copy. */
import type { Href } from 'expo-router';
import { Platform } from 'react-native';

import { hrefFor } from '@/lib/navigation/screen-registry';

const PLACE_SCREENS = ['7e-1', '3d-3'] as const;

export function dayRoute(tripId: string, dayNo: number, item?: string): Href {
  return {
    pathname: '/[tripId]/day/[day]',
    params: { tripId, day: String(dayNo), ...(item === undefined ? {} : { item }) },
  };
}

export function decideRoute(tripId: string, pollId: string): Href {
  return { pathname: '/[tripId]/decide/[pollId]', params: { tripId, pollId } };
}

export function reviewRoute(tripId: string, changesetId: string): Href {
  return { pathname: '/[tripId]/review/[changesetId]', params: { tripId, changesetId } };
}

/** The place's own page inside the trip (the redesigned page when it is on, else Explore's). */
export function placeRoute(placeId: string, tripId: string): Href | undefined {
  return PLACE_SCREENS.map((id) => hrefFor(id, { tripId, placeId })).find(
    (href) => href !== undefined,
  );
}

/** The platform maps app, dropped on a place. */
export function mapsUrl(title: string, lat: number, lng: number): string {
  const label = encodeURIComponent(title);
  return Platform.OS === 'ios'
    ? `maps:?q=${label}&ll=${lat},${lng}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
}
