/**
 * The country of a point, from the phone's own geocoder (no network call of ours): tells the
 * engine whether the user is at home or away. Null when the geocoder has no answer.
 */
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getLastKnownPositionAsync,
  reverseGeocodeAsync,
} from 'expo-location';

export async function countryOf(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return place?.isoCountryCode?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

const RECENT_MS = 10 * 60_000;
const LOCATE_TIMEOUT_MS = 15_000;

/**
 * One coarse position with no session running, for the at-home re-check: the system's recent
 * position when it has one, else a single lowest-accuracy read. It only reads the permission the
 * app already holds (it never asks) and gives null without it, on a timeout or on any failure.
 */
export async function coarsePosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (!(await getForegroundPermissionsAsync()).granted) return null;
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), LOCATE_TIMEOUT_MS),
    );
    const position =
      (await getLastKnownPositionAsync({ maxAge: RECENT_MS })) ??
      (await Promise.race([getCurrentPositionAsync({ accuracy: Accuracy.Lowest }), timeout]));
    return position === null
      ? null
      : { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}
