/**
 * The plan editing routes and the ones they link to by path: a place's detail, the change review
 * (3e-3) a guide suggestion opens, and the day's live decision (3g-2).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and URL schemes, never copy. */
import type { Href } from 'expo-router';
import { Platform } from 'react-native';

export function dayRoute(tripId: string, dayNo: number): Href {
  return { pathname: '/[tripId]/day/[day]', params: { tripId, day: String(dayNo) } };
}

export function decideRoute(tripId: string, pollId: string): Href {
  return { pathname: '/[tripId]/decide/[pollId]', params: { tripId, pollId } };
}

export function reviewRoute(tripId: string, changesetId: string): Href {
  return { pathname: '/[tripId]/review/[changesetId]', params: { tripId, changesetId } };
}

export function placeRoute(placeId: string): Href {
  return { pathname: '/places/[placeId]', params: { placeId } };
}

/** The platform maps app, dropped on a place. */
export function mapsUrl(title: string, lat: number, lng: number): string {
  const label = encodeURIComponent(title);
  return Platform.OS === 'ios'
    ? `maps:?q=${label}&ll=${lat},${lng}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
}
