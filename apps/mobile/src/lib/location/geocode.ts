/**
 * The country of a point, from the phone's own geocoder (no network call of ours): tells the
 * engine whether the user is at home or away. Null when the geocoder has no answer.
 */
import { reverseGeocodeAsync } from 'expo-location';

export async function countryOf(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return place?.isoCountryCode?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}
