/**
 * The handoff to the phone's maps app for spoken directions: Apple Maps or Google Maps on iPhone
 * (the person's choice, Apple Maps until they pick), Google Maps on Android. Both are https links,
 * so no URL scheme has to be declared or probed: Google's opens the app when it is installed (a
 * universal link / app link) and the website when it is not, and Apple's always opens Maps. Only
 * the place goes in the link; the maps app finds where the person is itself. A place we have an
 * address for is handed over by name and address, so the maps app shows "Chợ Hàn" and not a pair
 * of numbers; a place with no address goes by its point, which never lands on a namesake.
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

/** Where Start goes: the point, and the words a maps app can find it by. */
export interface GoDestination extends GoPoint {
  readonly name?: string | undefined;
  readonly address?: string | null | undefined;
  /** The destination's own name ("Đà Nẵng"), added when the address does not say it. */
  readonly city?: string | null | undefined;
}

/** "Chợ Hàn, 119 Trần Phú, Đà Nẵng"; null when there is no address to pin the name to. */
export function destinationWords(to: GoDestination): string | null {
  const name = to.name?.trim() ?? '';
  const address = to.address?.trim() ?? '';
  if (name === '' || address === '') return null;
  const city = to.city?.trim() ?? '';
  const parts = [name, address];
  if (city !== '' && !address.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  return parts.join(', ');
}

export function mapsDirectionsUrl(to: GoDestination, mode: GoMode, app: MapsApp): string {
  const words = destinationWords(to);
  const at =
    words === null ? `${to.lat.toFixed(6)},${to.lng.toFixed(6)}` : encodeURIComponent(words);
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
