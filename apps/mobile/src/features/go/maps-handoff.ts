/**
 * The handoff to the phone's maps app for spoken directions: Apple Maps or Google Maps on iPhone
 * (the person's choice, Apple Maps until they pick), Google Maps on Android. Both are https links,
 * so no URL scheme has to be declared or probed: Google's opens the app when it is installed (a
 * universal link / app link) and the website when it is not, and Apple's always opens Maps. Only
 * the place goes in the link; the maps app finds where the person is itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URLs and wire values, never copy. */
import { createMMKV, useMMKVString } from 'react-native-mmkv';

export type MapsApp = 'apple' | 'google';
export type GoMode = 'walk' | 'drive';
export type GoPlatform = 'ios' | 'android';

export interface GoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Closer than this, directions and the preview start on foot. */
export const WALK_FIRST_MAX_M = 2000;

export function defaultMapsApp(platform: GoPlatform): MapsApp {
  return platform === 'ios' ? 'apple' : 'google';
}

/** The app Start opens: the choice on iPhone, always Google Maps on Android. */
export function mapsAppFor(platform: GoPlatform, chosen: MapsApp | null): MapsApp {
  return platform === 'android' ? 'google' : (chosen ?? defaultMapsApp(platform));
}

export function mapsDirectionsUrl(to: GoPoint, mode: GoMode, app: MapsApp): string {
  const at = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  return app === 'apple'
    ? `https://maps.apple.com/?daddr=${at}&dirflg=${mode === 'walk' ? 'w' : 'd'}`
    : `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=${mode === 'walk' ? 'walking' : 'driving'}`;
}

const storage = createMMKV();
const MAPS_APP_KEY = 'cp.go.mapsApp';

const asMapsApp = (value: string | undefined): MapsApp | null =>
  value === 'apple' || value === 'google' ? value : null;

/** The maps app this phone was told to use, or null before the person picks one. */
export function chosenMapsApp(): MapsApp | null {
  return asMapsApp(storage.getString(MAPS_APP_KEY));
}

export function useChosenMapsApp(): readonly [MapsApp | null, (app: MapsApp) => void] {
  const [value, setValue] = useMMKVString(MAPS_APP_KEY, storage);
  return [asMapsApp(value), setValue] as const;
}
